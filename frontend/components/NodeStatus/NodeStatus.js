"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useNodeStatus } from "./useNodeStatus";

function timeAgo(ms) {
  if (!ms) return "never";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function NodeCard({ node }) {
  const cardBorder = node.stale ? palette.red.dark2 : palette.green.dark2;
  const statusColor = node.stale ? palette.red.base : palette.green.base;
  const statusLabel = node.stale ? "STALE" : "ACTIVE";

  return (
    <div
      style={{
        border: `1px solid ${cardBorder}`,
        borderRadius: "6px",
        padding: "10px 14px",
        backgroundColor: palette.gray.dark3,
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{
            color: palette.white,
            fontWeight: 700,
            fontSize: "14px",
            fontFamily: "monospace",
          }}
        >
          {node.callsign}
        </span>
        <span
          style={{
            color: statusColor,
            fontSize: "11px",
            fontWeight: 600,
            fontFamily: "monospace",
            border: `1px solid ${statusColor}`,
            borderRadius: "3px",
            padding: "1px 6px",
          }}
        >
          {statusLabel}
        </span>
      </div>
      <Body style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>
        Last seen: {timeAgo(node.lastUpdateMs)}
      </Body>
      {node.lat != null && node.lon != null && (
        <Body style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>
          {node.lat.toFixed(4)}, {node.lon.toFixed(4)}
        </Body>
      )}
    </div>
  );
}

export default function NodeStatus() {
  const { nodes, loading } = useNodeStatus();

  return (
    <div
      style={{
        backgroundColor: palette.gray.dark3,
        border: `1px solid ${palette.gray.dark2}`,
        borderRadius: "6px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${palette.gray.dark2}`,
          flexShrink: 0,
        }}
      >
        <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>
          NODE STATUS
        </H3>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {loading && (
          <Body style={{ color: palette.gray.base, fontSize: "13px" }}>
            Loading…
          </Body>
        )}
        {!loading && nodes.length === 0 && (
          <Body style={{ color: palette.gray.base, fontSize: "13px" }}>
            No nodes detected.
          </Body>
        )}
        {nodes.map((node) => (
          <NodeCard key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}
