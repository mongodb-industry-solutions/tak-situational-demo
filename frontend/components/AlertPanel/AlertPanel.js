"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useAlertPanel } from "./useAlertPanel";

function formatTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ""; }
}

function extractEmergency(xmlStr) {
  if (!xmlStr || typeof xmlStr !== "string") return { type: null };
  const typeMatch = xmlStr.match(/<emergency[^>]+type=['"]([^'"]+)['"]/i);
  return { type: typeMatch?.[1]?.trim() ?? null };
}

function alertColor(w) {
  if (w?.startsWith("b-r-")) return palette.red.base;
  return "#f97316";
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

function AlertCard({ alert }) {
  const { type: emergencyType } = extractEmergency(alert.r);
  const color = alertColor(alert.w);
  const name = alert.c || alert.e || "UNKNOWN";
  const label = emergencyType || alert.w || "ALERT";

  return (
    <div style={{ borderLeft: `3px solid ${color}`, backgroundColor: palette.gray.dark2, borderRadius: "4px", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: palette.white, fontWeight: 700, fontSize: "12px", fontFamily: "monospace" }}>{name}</span>
        <span style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>{formatTime(alert.b)}</span>
      </div>
      <span style={{ color, fontSize: "11px", fontWeight: 700, fontFamily: "monospace", border: `1px solid ${color}`, borderRadius: "3px", padding: "2px 6px", alignSelf: "flex-start", textTransform: "uppercase" }}>
        {label}
      </span>
      {alert.e && alert.e !== alert.c && (
        <Body style={{ color: palette.gray.light1, fontSize: "11px" }}>Sent by: {alert.e}</Body>
      )}
    </div>
  );
}

export default function AlertPanel({ collapsed, onToggle }) {
  const { alerts, loading } = useAlertPanel();

  return (
    <div style={{ backgroundColor: palette.gray.dark3, border: `1px solid ${palette.gray.dark2}`, borderRadius: "6px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ padding: "10px 16px", borderBottom: collapsed ? "none" : `1px solid ${palette.gray.dark2}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>ALERTS</H3>
          {alerts.length > 0 && (
            <span style={{ backgroundColor: palette.red.base, color: palette.white, fontSize: "11px", fontWeight: 700, fontFamily: "monospace", borderRadius: "10px", padding: "1px 7px", lineHeight: "1.6" }}>
              {alerts.length}
            </span>
          )}
        </div>
        <Chevron open={!collapsed} />
      </div>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>Loading…</Body>}
          {!loading && alerts.length === 0 && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>No active alerts.</Body>}
          {alerts.map((alert) => <AlertCard key={alert._id} alert={alert} />)}
        </div>
      )}
    </div>
  );
}
