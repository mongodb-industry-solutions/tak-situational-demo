"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useTelemetryPanel } from "./useTelemetryPanel";

const COMPASS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

function toCompass(deg) {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

function formatTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={palette.gray.base} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease", flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function MetricRow({ label, value, unit }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>{label}</span>
      <span style={{ color: palette.white, fontSize: "12px", fontFamily: "monospace", fontWeight: 600 }}>
        {value}
        {unit && <span style={{ color: palette.gray.light1, fontWeight: 400, marginLeft: "3px" }}>{unit}</span>}
      </span>
    </div>
  );
}

function TelemetryCard({ node }) {
  const callsign = node.e || node.c || node.d || node._id;
  const isStale = !node.o || Date.now() > node.o;
  const accentColor = isStale ? palette.gray.dark1 : "#22c55e";

  const speedKmh = node.speed_ms != null ? (node.speed_ms * 3.6).toFixed(1) : null;
  const course   = node.course_deg != null
    ? `${toCompass(node.course_deg)} (${Math.round(node.course_deg)}°)`
    : null;
  const altM     = node.alt_m != null ? Math.round(node.alt_m) : null;
  const ceM      = node.ce_m  != null ? Math.round(node.ce_m)  : null;

  const metrics = [
    speedKmh != null && { label: "Speed",    value: speedKmh, unit: "km/h" },
    course   != null && { label: "Heading",  value: course,   unit: "" },
    altM     != null && { label: "Altitude", value: altM,     unit: "m" },
    ceM      != null && { label: "Accuracy", value: `±${ceM}`, unit: "m" },
  ].filter(Boolean);

  return (
    <div style={{
      borderLeft: `3px solid ${accentColor}`,
      backgroundColor: palette.gray.dark2,
      borderRadius: "4px",
      padding: "10px 12px",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: palette.white, fontWeight: 700, fontSize: "12px", fontFamily: "monospace" }}>
          {callsign}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {isStale && <span style={{ color: palette.yellow.base, fontSize: "10px", fontFamily: "monospace" }}>⚠ STALE</span>}
          <span style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>{formatTime(node.b)}</span>
        </div>
      </div>

      {metrics.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingTop: "4px", borderTop: `1px solid ${palette.gray.dark1}` }}>
          {metrics.map(({ label, value, unit }) => (
            <MetricRow key={label} label={label} value={value} unit={unit} />
          ))}
        </div>
      ) : (
        <Body style={{ color: palette.gray.base, fontSize: "11px" }}>No sensor data available</Body>
      )}
    </div>
  );
}

export default function TelemetryPanel({ collapsed, onToggle }) {
  const { readings, loading } = useTelemetryPanel();

  return (
    <div style={{ backgroundColor: palette.gray.dark3, border: `1px solid ${palette.gray.dark2}`, borderRadius: "6px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ padding: "10px 16px", borderBottom: collapsed ? "none" : `1px solid ${palette.gray.dark2}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>TELEMETRY</H3>
          {readings.length > 0 && (
            <span style={{ backgroundColor: "#22c55e", color: palette.black, fontSize: "11px", fontWeight: 700, fontFamily: "monospace", borderRadius: "10px", padding: "1px 7px", lineHeight: "1.6" }}>
              {readings.length}
            </span>
          )}
        </div>
        <Chevron open={!collapsed} />
      </div>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>Loading…</Body>}
          {!loading && readings.length === 0 && (
            <Body style={{ color: palette.gray.base, fontSize: "13px" }}>No active nodes.</Body>
          )}
          {readings.map((r) => <TelemetryCard key={r._id} node={r} />)}
        </div>
      )}
    </div>
  );
}
