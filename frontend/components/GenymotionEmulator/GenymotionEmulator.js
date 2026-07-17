"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { palette } from "@leafygreen-ui/palette";

// CDN load of the Genymotion device-web-player (CSS + JS), shared across instances so
// the script is injected once. If the CDN path/global differs, this is the spot to fix.
const PLAYER_CSS = "https://cdn.jsdelivr.net/npm/@genymotion/device-web-player/dist/css/device-renderer.min.css";
const PLAYER_JS = "https://cdn.jsdelivr.net/npm/@genymotion/device-web-player/dist/js/device-renderer.min.js";

let _playerReady = null;
function ensurePlayer() {
  if (_playerReady) return _playerReady;
  _playerReady = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.genyDeviceWebPlayer) {
      resolve();
      return;
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = PLAYER_CSS;
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = PLAYER_JS;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("failed to load device-web-player from CDN"));
    document.head.appendChild(script);
  });
  return _playerReady;
}

const STATUS = {
  idle: { color: palette.gray.base, label: "IDLE" },
  starting: { color: "#facc15", label: "STARTING…" },
  booting: { color: "#facc15", label: "BOOTING ATAK…" },
  connecting: { color: "#facc15", label: "CONNECTING…" },
  active: { color: "#22c55e", label: "ACTIVE" },
  stopping: { color: "#f97316", label: "STOPPING…" },
  error: { color: "#ef4444", label: "ERROR" },
};

const POLL_MS = 5000;
const MAX_POLLS = 48; // ~4 min ceiling waiting for ONLINE

export default function GenymotionEmulator({
  label = "device",
  recipe,          // per-device recipe UUID (falls back to server env if omitted)
  size,            // { width, height } — defaults to 640×360
  autoStart = false,
  startSignal = 0, // increment from a parent to boot this device (e.g. "Start Simulation")
  onReady,
}) {
  const W = size?.width ?? 640;
  const H = size?.height ?? 360;
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const instanceRef = useRef(null); // running instance UUID (for stop)
  const pollRef = useRef(null);
  const statusRef = useRef("idle");
  const [status, setStatus] = useState("idle");
  const [msg, setMsg] = useState(null);

  const setBoth = (s) => {
    statusRef.current = s;
    setStatus(s);
  };

  const teardownPlayer = () => {
    try {
      rendererRef.current?.disconnect?.();
      rendererRef.current?.VM_communication?.disconnect?.();
    } catch {
      /* ignore */
    }
    rendererRef.current = null;
  };

  const stop = useCallback(async () => {
    clearInterval(pollRef.current);
    pollRef.current = null;
    teardownPlayer();
    onReady?.(null); // tell the page the renderer is gone
    const uuid = instanceRef.current;
    instanceRef.current = null;
    if (uuid) {
      setBoth("stopping");
      try {
        await fetch(`/api/genymotion/device?instance=${uuid}`, { method: "DELETE", keepalive: true });
      } catch (e) {
        console.warn(`[Genymotion:${label}] stop failed:`, e);
      }
    }
    setMsg(null);
    setBoth("idle");
  }, [label, onReady]);

  const connect = useCallback(async (webrtcAddress, token) => {
    setBoth("connecting");
    await ensurePlayer();
    if (!containerRef.current || statusRef.current !== "connecting") return;
    const factory = new window.genyDeviceWebPlayer.DeviceRendererFactory();
    rendererRef.current = factory.setupRenderer(containerRef.current, webrtcAddress, {
      token,
      // Clean demo surface: hide every device-control widget (right toolbar + the
      // floating controls below the device). This is a viewer, not a console.
      displayToolbar: false,
      floatingToolbar: false,
      fileUpload: false,
    });
    setBoth("active");
    onReady?.(rendererRef.current);
  }, [onReady]);

  const start = useCallback(async () => {
    if (statusRef.current !== "idle" && statusRef.current !== "error") return;
    setMsg(null);
    setBoth("starting");
    try {
      const res = await fetch("/api/genymotion/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `atak-${label}`, recipe }),
      });
      const data = await res.json();
      if (!res.ok || !data.instanceUuid) {
        console.error(`[Genymotion:${label}] start failed:`, data);
        setMsg(data?.error || "start failed (see console _raw)");
        setBoth("error");
        return;
      }
      instanceRef.current = data.instanceUuid;
      setBoth("booting");

      let attempts = 0;
      pollRef.current = setInterval(async () => {
        if (++attempts > MAX_POLLS) {
          clearInterval(pollRef.current);
          setMsg("timed out waiting for ONLINE");
          setBoth("error");
          return;
        }
        try {
          const r = await fetch(`/api/genymotion/device?instance=${instanceRef.current}`);
          const d = await r.json();
          if (d.state === "ONLINE" && d.webrtcAddress && d.token) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            await connect(d.webrtcAddress, d.token);
          } else if (d.state === "ONLINE") {
            console.warn(`[Genymotion:${label}] ONLINE but missing connection fields:`, d);
          } else if (["STOPPING", "DELETING", "ERROR", "UNKNOWN"].includes(d.state)) {
            clearInterval(pollRef.current);
            setMsg(`instance state: ${d.state}`);
            setBoth("error");
          }
          // CREATING / BOOTING → keep polling
        } catch (e) {
          console.warn(`[Genymotion:${label}] poll error:`, e);
        }
      }, POLL_MS);
    } catch (e) {
      console.error(`[Genymotion:${label}] start error:`, e);
      setMsg(String(e?.message ?? e));
      setBoth("error");
    }
  }, [label, recipe, connect]);

  // External boot trigger: a parent increments `startSignal` to launch this device
  // (e.g. a single "Start Simulation" button starting both). start() self-guards
  // against double-starts, so this is safe.
  useEffect(() => {
    if (startSignal > 0) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal]);

  // Auto-start (off by default to stay cost-safe and avoid dev StrictMode double-starts).
  useEffect(() => {
    if (autoStart) start();
    // Best-effort stop if the tab is closed while a device is running.
    const onUnload = () => {
      if (instanceRef.current) {
        fetch(`/api/genymotion/device?instance=${instanceRef.current}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      clearInterval(pollRef.current);
      teardownPlayer();
      if (instanceRef.current) {
        // keepalive lets this DELETE complete after unmount/navigation
        fetch(`/api/genymotion/device?instance=${instanceRef.current}`, {
          method: "DELETE",
          keepalive: true,
        }).catch(() => {});
        instanceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const running = ["starting", "booting", "connecting", "active"].includes(status);
  const s = STATUS[status];

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            backgroundColor: s.color,
            boxShadow: status === "active" ? `0 0 6px ${s.color}` : "none",
          }} />
          <span style={{ color: s.color, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>
            {s.label}
          </span>
        </div>

        <button
          onClick={running ? stop : start}
          disabled={status === "stopping"}
          style={{
            backgroundColor: running ? "#7f1d1d" : "#166534",
            border: `1px solid ${running ? "#ef4444" : "#22c55e"}`,
            borderRadius: 4,
            color: palette.white,
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 12px",
            cursor: status === "stopping" ? "not-allowed" : "pointer",
            letterSpacing: "0.05em",
            opacity: status === "stopping" ? 0.5 : 1,
          }}
        >
          {running ? "STOP" : "START"}
        </button>
      </div>

      <div style={{
        position: "relative",
        width: W,
        height: H,
        backgroundColor: "#000",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 0 0 1px #333, 0 8px 40px rgba(0,0,0,0.7)",
      }}>
        {/* The web player takes over this node's DOM entirely. React must NEVER render
            children into it (doing so throws removeChild NotFoundError). The status
            overlay is a sibling layered on top, not a child. */}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        {status !== "active" && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 8, padding: 16,
            textAlign: "center", pointerEvents: "none",
          }}>
            <span style={{ color: palette.gray.light1, fontFamily: "monospace", fontSize: 12 }}>
              {status === "idle" ? "Press START to launch a device" : s.label}
            </span>
            {status === "booting" && (
              <span style={{ color: palette.gray.base, fontFamily: "monospace", fontSize: 10 }}>
                first boot from the recipe takes ~1–2 min
              </span>
            )}
            {msg && (
              <span style={{ color: palette.gray.base, fontFamily: "monospace", fontSize: 10, wordBreak: "break-all" }}>
                {msg}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
