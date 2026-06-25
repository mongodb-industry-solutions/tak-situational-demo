"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import NavBar from "@/components/NavBar/NavBar";
import { palette } from "@leafygreen-ui/palette";

const GenymotionEmulator = dynamic(
  () => import("@/components/GenymotionEmulator/GenymotionEmulator"),
  { ssr: false, loading: () => <DeviceSkeleton /> }
);

const GPS_PRESETS = [
  { label: "Camp Pendleton", lat: 33.3772, lng: -117.5277 },
  { label: "Fort Bragg", lat: 35.1395, lng: -79.0063 },
  { label: "Pentagon", lat: 38.8719, lng: -77.0563 },
  { label: "Quantico", lat: 38.5218, lng: -77.3764 },
];

function DeviceSkeleton() {
  return (
    <div style={{
      width: 640, height: 360, backgroundColor: "#1a1a1a", borderRadius: 12,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: palette.gray.dark1, fontFamily: "monospace", fontSize: 11 }}>Loading…</span>
    </div>
  );
}

function DeviceLabel({ name, subtitle }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color: palette.white, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
        {name}
      </span>
      <span style={{ color: palette.gray.base, fontFamily: "monospace", fontSize: 10 }}>
        {subtitle}
      </span>
    </div>
  );
}

// Inject a GPS fix into a connected Genymotion device. Message format read from the
// player bundle: channel "gps", messages ["set latitude X", "set longitude Y", …, "enable"].
function sendGps(renderer, lat, lng, opts = {}) {
  const send = renderer?.VM_communication?.sendData;
  if (typeof send !== "function") return false;
  const messages = [`set latitude ${lat}`, `set longitude ${lng}`];
  if (opts.altitude != null) messages.push(`set altitude ${opts.altitude}`);
  if (opts.accuracy != null) messages.push(`set accuracy ${opts.accuracy}`);
  if (opts.bearing != null) messages.push(`set bearing ${opts.bearing}`);
  if (opts.speed != null) messages.push(`set speed ${opts.speed}`);
  messages.push("enable");
  try {
    renderer.VM_communication.sendData({ channel: "gps", messages });
    return true;
  } catch (e) {
    console.warn("[gps] sendData failed:", e);
    return false;
  }
}

function GpsControl({ label, renderer, preset }) {
  const active = !!renderer;
  const [pos, setPos] = useState({ lat: preset.lat, lng: preset.lng });
  const [moving, setMoving] = useState(false);
  const [status, setStatus] = useState(null);
  const moveRef = useRef(null);
  const walkRef = useRef({ lat: preset.lat, lng: preset.lng, bearing: 45 });

  const stopMoving = useCallback(() => {
    if (moveRef.current) clearInterval(moveRef.current);
    moveRef.current = null;
    setMoving(false);
  }, []);

  const placeAt = useCallback((lat, lng) => {
    walkRef.current = { lat, lng, bearing: walkRef.current.bearing };
    setPos({ lat, lng });
    // stationary placement → speed 0 (no course; marker stays put)
    const ok = sendGps(renderer, lat.toFixed(6), lng.toFixed(6), { accuracy: 5, speed: 0 });
    setStatus(ok ? `placed ${lat.toFixed(4)}, ${lng.toFixed(4)}` : "no active device");
  }, [renderer]);

  // Drop the device onto its preset as soon as it connects, so ATAK gets a fix and
  // leaves the globe view. Small delay lets ATAK's map settle after connect.
  useEffect(() => {
    if (!active) { stopMoving(); return; }
    const t = setTimeout(() => placeAt(walkRef.current.lat, walkRef.current.lng), 2500);
    return () => clearTimeout(t);
  }, [active, placeAt, stopMoving]);

  useEffect(() => () => { if (moveRef.current) clearInterval(moveRef.current); }, []);

  const toggleMove = useCallback(() => {
    if (moveRef.current) { stopMoving(); return; }
    if (!renderer) { setStatus("no active device"); return; }
    setMoving(true);
    moveRef.current = setInterval(() => {
      const s = walkRef.current;
      const rad = (s.bearing * Math.PI) / 180;
      s.lat += 0.0006 * Math.cos(rad);   // ~65 m / tick
      s.lng += 0.0006 * Math.sin(rad);
      s.bearing = (s.bearing + (Math.random() - 0.5) * 30 + 360) % 360; // gentle wander
      // speed > 0 + bearing → ATAK treats it as travel and rotates the self-marker to course
      sendGps(renderer, s.lat.toFixed(6), s.lng.toFixed(6), { bearing: Math.round(s.bearing), speed: 12, accuracy: 5 });
      setPos({ lat: s.lat, lng: s.lng });
    }, 2000);
  }, [renderer, stopMoving]);

  return (
    <div style={{
      backgroundColor: palette.gray.dark3,
      border: `1px solid ${palette.gray.dark2}`,
      borderRadius: 8,
      padding: "12px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 10,
      opacity: active ? 1 : 0.5,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: palette.gray.light1, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>
          {label} — GPS / MOVEMENT
        </span>
        <span style={{ color: active ? "#22c55e" : palette.gray.dark1, fontFamily: "monospace", fontSize: 10 }}>
          {active ? "● live" : "○ offline"}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {GPS_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => placeAt(p.lat, p.lng)}
            disabled={!active}
            style={{
              backgroundColor: palette.gray.dark2,
              border: `1px solid ${palette.gray.dark1}`,
              borderRadius: 4,
              color: palette.gray.light1,
              fontFamily: "monospace",
              fontSize: 10,
              padding: "3px 8px",
              cursor: active ? "pointer" : "not-allowed",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={toggleMove}
        disabled={!active}
        style={{
          backgroundColor: moving ? "#7f1d1d" : "#166534",
          border: `1px solid ${moving ? "#ef4444" : "#22c55e"}`,
          borderRadius: 4,
          color: palette.white,
          fontFamily: "monospace",
          fontSize: 11,
          fontWeight: 700,
          padding: "5px 12px",
          cursor: active ? "pointer" : "not-allowed",
          letterSpacing: "0.05em",
        }}
      >
        {moving ? "■ STOP MOVEMENT" : "▶ SIMULATE MOVEMENT"}
      </button>

      <span style={{ color: palette.gray.base, fontFamily: "monospace", fontSize: 10 }}>
        {active
          ? `pos ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}${status ? ` · ${status}` : ""}`
          : "Start the device to enable GPS injection."}
      </span>
    </div>
  );
}

export default function GenymotionPage() {
  const [renderer1, setRenderer1] = useState(null);
  const [renderer2, setRenderer2] = useState(null);

  return (
    <main style={{
      backgroundColor: "#0d1117",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <NavBar />

      <div style={{
        flex: 1, minHeight: 0, display: "flex", padding: "16px", gap: "24px", overflow: "hidden",
      }}>
        {/* LEFT — two stacked field devices */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 16, flexShrink: 0, overflowY: "auto",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DeviceLabel name="FIELD DEVICE — ALPHA-1" subtitle="ATAK CIV · Genymotion ARM64" />
            <GenymotionEmulator label="alpha-1" onReady={setRenderer1} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DeviceLabel name="FIELD DEVICE — ALPHA-2" subtitle="ATAK CIV · Genymotion ARM64" />
            <GenymotionEmulator label="alpha-2" onReady={setRenderer2} />
          </div>
        </div>

        {/* RIGHT — controls */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto",
        }}>
          <div style={{
            backgroundColor: "#161b22",
            border: `1px solid ${palette.gray.dark2}`,
            borderRadius: 8,
            padding: "10px 14px",
          }}>
            <span style={{ color: palette.green.base, fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
              GENYMOTION VIEW
            </span>
            <p style={{ color: palette.gray.light1, fontFamily: "monospace", fontSize: 10, margin: "6px 0 0", lineHeight: 1.6 }}>
              START a device → it boots ATAK from the recipe and drops onto its preset location (off the globe).
              SIMULATE MOVEMENT walks the GPS so the track moves and propagates through Ditto → Atlas → dashboard.
            </p>
          </div>

          <GpsControl label="ALPHA-1" renderer={renderer1} preset={GPS_PRESETS[0]} />
          <GpsControl label="ALPHA-2" renderer={renderer2} preset={GPS_PRESETS[1]} />
        </div>
      </div>
    </main>
  );
}
