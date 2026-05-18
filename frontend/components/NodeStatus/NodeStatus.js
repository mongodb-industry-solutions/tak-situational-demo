"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useNodeStatus } from "./useNodeStatus";

const COMPASS = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
function toCompass(deg) { return COMPASS[Math.round(deg / 22.5) % 16]; }

const TEAM_COLORS = {
  Cyan:       "#22d3ee",
  Magenta:    "#e879f9",
  Yellow:     "#facc15",
  Orange:     "#f97316",
  "Dark Green": "#16a34a",
  Red:        "#ef4444",
  Blue:       "#3b82f6",
  Maroon:     "#9f1239",
  Purple:     "#a855f7",
  "Dark Blue":  "#1d4ed8",
  Teal:       "#0d9488",
  White:      "#e2e8f0",
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
      <span style={{ color: palette.gray.dark1, fontSize: "10px", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ color: palette.gray.light2, fontSize: "11px", fontFamily: "monospace", fontWeight: 600 }}>
        {value}
        {unit && <span style={{ color: palette.gray.base, fontWeight: 400, marginLeft: "2px" }}>{unit}</span>}
      </span>
    </div>
  );
}

function NodeCard({ node }) {
  const cardBorder = node.stale ? palette.red.dark2 : palette.green.dark2;
  const statusColor = node.stale ? palette.red.base : palette.green.base;
  const statusLabel = node.stale ? "STALE" : "ACTIVE";

  const speedKmh  = node.speedMs   != null ? (node.speedMs * 3.6).toFixed(1) : null;
  const heading   = node.courseDeg != null ? `${toCompass(node.courseDeg)} ${Math.round(node.courseDeg)}°` : null;
  const altM      = node.altM      != null ? Math.round(node.altM) : null;
  const ceM       = node.ceM       != null ? Math.round(node.ceM)  : null;

  const metrics = [
    speedKmh != null && { label: "Speed",    value: speedKmh, unit: "km/h" },
    heading  != null && { label: "Heading",  value: heading,  unit: "" },
    altM     != null && { label: "Altitude", value: altM,     unit: "m" },
    ceM      != null && { label: "Accuracy", value: `±${ceM}`, unit: "m" },
  ].filter(Boolean);

  return (
    <div style={{ border: `1px solid ${cardBorder}`, borderRadius: "6px", padding: "10px 14px", backgroundColor: palette.gray.dark3, display: "flex", flexDirection: "column", gap: "4px" }}>
      {/* Row 1: callsign + status badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: palette.white, fontWeight: 700, fontSize: "14px", fontFamily: "monospace" }}>
          {node.callsign}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {node.battery != null && (
            <span style={{ color: batteryColor(node.battery), fontSize: "11px", fontFamily: "monospace", fontWeight: 600 }}>
              {node.battery}%
            </span>
          )}
          <span style={{ color: statusColor, fontSize: "11px", fontWeight: 600, fontFamily: "monospace", border: `1px solid ${statusColor}`, borderRadius: "3px", padding: "1px 6px" }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Row 2: CoT type + team pill */}
      {(node.cotType || node.team) && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {node.cotType && (
            <span style={{ color: palette.gray.base, fontSize: "10px", fontFamily: "monospace", letterSpacing: "0.04em" }}>
              {node.cotType}
            </span>
          )}
          {node.team && (
            <span style={{
              fontSize: "10px", fontFamily: "monospace", fontWeight: 600,
              color: teamColor(node.team),
              border: `1px solid ${teamColor(node.team)}`,
              borderRadius: "10px", padding: "0px 6px", lineHeight: "1.6",
            }}>
              {node.team}{node.role ? ` · ${node.role}` : ""}
            </span>
          )}
        </div>
      )}

      <Body style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>
        Last seen: {timeAgo(node.lastUpdateMs)}
      </Body>

      {node.lat != null && node.lon != null && (
        <Body style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>
          {node.lat.toFixed(4)}, {node.lon.toFixed(4)}
        </Body>
      )}

      {metrics.length > 0 && (
        <div style={{ marginTop: "4px", paddingTop: "6px", borderTop: `1px solid ${palette.gray.dark2}`, display: "flex", flexDirection: "column", gap: "3px" }}>
          {metrics.map(({ label, value, unit }) => (
            <MetricRow key={label} label={label} value={value} unit={unit} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function NodeStatus({ collapsed, onToggle }) {
  const { nodes, loading } = useNodeStatus();

  return (
    <div style={{ backgroundColor: palette.gray.dark3, border: `1px solid ${palette.gray.dark2}`, borderRadius: "6px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ padding: "10px 16px", borderBottom: collapsed ? "none" : `1px solid ${palette.gray.dark2}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>NODE STATUS</H3>
        <Chevron open={!collapsed} />
      </div>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>Loading…</Body>}
          {!loading && nodes.length === 0 && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>No nodes detected.</Body>}
          {nodes.map((node) => <NodeCard key={node.id} node={node} />)}
        </div>
      )}
    </div>
  );
}
