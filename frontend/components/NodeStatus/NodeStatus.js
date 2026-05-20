"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useNodeStatus } from "./useNodeStatus";

const TEAM_COLORS = {
  Cyan:         "#22d3ee",
  Magenta:      "#e879f9",
  Yellow:       "#facc15",
  Orange:       "#f97316",
  "Dark Green": "#16a34a",
  Red:          "#ef4444",
  Blue:         "#3b82f6",
  Maroon:       "#9f1239",
  Purple:       "#a855f7",
  "Dark Blue":  "#1d4ed8",
  Teal:         "#0d9488",
  White:        "#e2e8f0",
};

function teamColor(name) {
  return TEAM_COLORS[name] || palette.gray.base;
}

function batteryColor(pct) {
  if (pct >= 50) return "#22c55e";
  if (pct >= 20) return "#facc15";
  return "#ef4444";
}

function timeAgo(ms) {
  if (!ms) return "never";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

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

function EkgWave() {
  const seg = (x) =>
    `M${x},10 L${x+10},10 L${x+14},3 L${x+16},17 L${x+20},10 L${x+35},10 L${x+38},7 L${x+40},13 L${x+43},10 L${x+60},10`;
  return (
    <div style={{ width: "100%", height: "22px", overflow: "hidden" }}>
      <svg
        width="300"
        height="22"
        viewBox="0 0 300 20"
        style={{ display: "block", animation: "ekg-scroll 1.8s linear infinite" }}
      >
        {[0, 60, 120, 180, 240].map((x) => (
          <path
            key={x}
            d={seg(x)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}

function NodeCard({ node }) {
  const hasAlert = node.alert != null;
  const statusColor = node.stale ? palette.red.base : palette.green.base;
  const statusLabel = node.stale ? "STALE" : "ACTIVE";
  const dotColor = node.team ? teamColor(node.team) : palette.gray.base;

  const borderColor = hasAlert
    ? palette.red.dark2
    : node.stale ? palette.red.dark2 : palette.green.dark2;

  const hasTelemetry = node.telemetry &&
    (node.telemetry.speed_ms != null || node.telemetry.alt_m != null);

  const alertLabel = hasAlert
    ? (extractEmergency(node.alert.r).type || node.alert.w || "ALERT")
    : null;
  const aColor = hasAlert ? alertColor(node.alert.w) : null;

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: "6px",
      padding: "10px 14px",
      backgroundColor: palette.gray.dark3,
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      animation: hasAlert ? "alert-pulse-border 1.4s ease-in-out infinite" : "none",
    }}>
      {/* Row 1: team dot + callsign + status badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: dotColor, flexShrink: 0 }} />
          <span style={{ color: palette.white, fontWeight: 700, fontSize: "13px", fontFamily: "monospace" }}>
            {node.callsign}
          </span>
        </div>
        <span style={{ color: statusColor, fontSize: "10px", fontWeight: 700, fontFamily: "monospace", border: `1px solid ${statusColor}`, borderRadius: "3px", padding: "1px 5px" }}>
          {statusLabel}
        </span>
      </div>

      {/* EKG waveform */}
      <EkgWave />

      {/* Telemetry row */}
      {hasTelemetry && (
        <div style={{ display: "flex", alignItems: "stretch", gap: "0" }}>
          {node.telemetry.speed_ms != null && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ color: palette.gray.light2, fontFamily: "monospace", fontSize: "13px", fontWeight: 600 }}>
                {(node.telemetry.speed_ms * 3.6).toFixed(1)}
              </span>
              <span style={{ color: palette.gray.dark1, fontFamily: "monospace", fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                km/h  SPEED
              </span>
            </div>
          )}
          {node.telemetry.speed_ms != null && node.telemetry.alt_m != null && (
            <div style={{ width: "1px", backgroundColor: palette.gray.dark2, margin: "0 4px" }} />
          )}
          {node.telemetry.alt_m != null && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ color: palette.gray.light2, fontFamily: "monospace", fontSize: "13px", fontWeight: 600 }}>
                {Math.round(node.telemetry.alt_m)}
              </span>
              <span style={{ color: palette.gray.dark1, fontFamily: "monospace", fontSize: "9px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                m  ALT
              </span>
            </div>
          )}
        </div>
      )}

      {/* Alert row */}
      {hasAlert && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingTop: "4px", borderTop: `1px solid ${palette.gray.dark2}` }}>
          <span style={{ color: aColor, fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>⚠</span>
          <span style={{ color: aColor, fontSize: "10px", fontFamily: "monospace", fontWeight: 700, flex: 1, textTransform: "uppercase" }}>
            {alertLabel}
          </span>
          <span style={{ color: palette.gray.base, fontSize: "10px", fontFamily: "monospace" }}>
            {formatTime(node.alert.b)}
          </span>
        </div>
      )}

      {/* Details */}
      <div style={{ paddingTop: "4px", borderTop: `1px solid ${palette.gray.dark2}`, display: "flex", flexDirection: "column", gap: "3px" }}>
        {node.team && (
          <span style={{
            fontSize: "10px", fontFamily: "monospace", fontWeight: 600,
            color: teamColor(node.team),
            border: `1px solid ${teamColor(node.team)}`,
            borderRadius: "10px", padding: "0 6px", lineHeight: "1.6",
            alignSelf: "flex-start",
          }}>
            {node.team}{node.role ? ` · ${node.role}` : ""}
          </span>
        )}
        {node.battery != null && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: palette.gray.dark1, fontSize: "10px", fontFamily: "monospace", textTransform: "uppercase" }}>Battery</span>
            <span style={{ color: batteryColor(node.battery), fontSize: "10px", fontFamily: "monospace", fontWeight: 600 }}>
              {node.battery}%
            </span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: palette.gray.dark1, fontSize: "10px", fontFamily: "monospace", textTransform: "uppercase" }}>Last seen</span>
          <span style={{ color: palette.gray.base, fontSize: "10px", fontFamily: "monospace" }}>
            {timeAgo(node.lastUpdateMs)}
          </span>
        </div>
        {node.lat != null && node.lon != null && (
          <span style={{ color: palette.gray.base, fontSize: "10px", fontFamily: "monospace" }}>
            {node.lat.toFixed(4)}, {node.lon.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

export default function NodeStatus() {
  const { nodes, loading } = useNodeStatus();

  return (
    <div style={{ backgroundColor: palette.gray.dark3, border: `1px solid ${palette.gray.dark2}`, borderRadius: "6px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${palette.gray.dark2}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>CONNECTED NODES</H3>
        {nodes.length > 0 && (
          <span style={{ backgroundColor: palette.gray.dark2, color: palette.gray.light1, fontSize: "11px", fontFamily: "monospace", borderRadius: "10px", padding: "1px 7px", lineHeight: "1.6" }}>
            {nodes.length}
          </span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {loading && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>Loading…</Body>}
        {!loading && nodes.length === 0 && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>No nodes detected.</Body>}
        {nodes.map((node) => <NodeCard key={node.id} node={node} />)}
      </div>
    </div>
  );
}
