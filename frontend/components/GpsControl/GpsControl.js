"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { palette } from "@leafygreen-ui/palette";

export const GPS_PRESETS = [
  { label: "Camp Pendleton", lat: 33.3772, lng: -117.5277 },
  { label: "Fort Bragg", lat: 35.1395, lng: -79.0063 },
  { label: "Pentagon", lat: 38.8719, lng: -77.0563 },
  { label: "Quantico", lat: 38.5218, lng: -77.3764 },
];

// Inject a GPS fix into a connected Genymotion device. Message format read from the
// player bundle: channel "gps", messages ["set latitude X", "set longitude Y", …, "enable"].
export function sendGps(renderer, lat, lng, opts = {}) {
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

export default function GpsControl({ label, renderer, preset }) {
  const active = !!renderer;
  const [moving, setMoving] = useState(false);
  const moveRef = useRef(null);
  const walkRef = useRef({ lat: preset.lat, lng: preset.lng, bearing: 45 });

  const stopMoving = useCallback(() => {
    if (moveRef.current) clearInterval(moveRef.current);
    moveRef.current = null;
    setMoving(false);
  }, []);

  const placeAt = useCallback((lat, lng) => {
    walkRef.current = { lat, lng, bearing: walkRef.current.bearing };
    // stationary placement → speed 0 (no course; marker stays put)
    sendGps(renderer, lat.toFixed(6), lng.toFixed(6), { accuracy: 5, speed: 0 });
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
    if (!renderer) return;
    setMoving(true);
    moveRef.current = setInterval(() => {
      const s = walkRef.current;
      const rad = (s.bearing * Math.PI) / 180;
      s.lat += 0.0006 * Math.cos(rad);   // ~65 m / tick
      s.lng += 0.0006 * Math.sin(rad);
      s.bearing = (s.bearing + (Math.random() - 0.5) * 30 + 360) % 360; // gentle wander
      // speed > 0 + bearing → ATAK treats it as travel and rotates the self-marker to course
      sendGps(renderer, s.lat.toFixed(6), s.lng.toFixed(6), { bearing: Math.round(s.bearing), speed: 12, accuracy: 5 });
    }, 2000);
  }, [renderer, stopMoving]);

  return (
    <div style={{
      backgroundColor: palette.gray.dark3,
      border: `1px solid ${palette.gray.dark2}`,
      borderRadius: 8,
      padding: "8px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      opacity: active ? 1 : 0.5,
    }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <span style={{ color: palette.gray.light1, fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>
          {label} GPS
        </span>
        <span style={{ color: active ? "#22c55e" : palette.gray.dark1, fontFamily: "monospace", fontSize: 10 }}>
          {active ? "●" : "○"}
        </span>
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
          padding: "4px 12px",
          cursor: active ? "pointer" : "not-allowed",
          letterSpacing: "0.05em",
        }}
      >
        {moving ? "■ STOP MOVEMENT" : "▶ SIMULATE MOVEMENT"}
      </button>
    </div>
  );
}
