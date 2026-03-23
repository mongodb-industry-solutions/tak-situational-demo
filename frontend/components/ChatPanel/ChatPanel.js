"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import { useChatPanel } from "./useChatPanel";

function formatTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function ChatPanel() {
  const { messages, loading, bottomRef } = useChatPanel();

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
          COMMS FEED
        </H3>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {loading && (
          <Body style={{ color: palette.gray.base, fontSize: "13px" }}>
            Loading…
          </Body>
        )}
        {!loading && messages.length === 0 && (
          <Body style={{ color: palette.gray.base, fontSize: "13px" }}>
            No messages yet.
          </Body>
        )}
        {messages.map((msg) => (
          <div key={msg._id}>
            <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span
                style={{
                  color: palette.green.base,
                  fontWeight: 700,
                  fontSize: "12px",
                  fontFamily: "monospace",
                  flexShrink: 0,
                }}
              >
                {msg.e || msg.authorCallsign || "UNKNOWN"}
              </span>
              <span
                style={{
                  color: palette.gray.base,
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              >
                {formatTime(msg.b)}
              </span>
            </div>
            <Body
              style={{
                color: palette.gray.light2,
                fontSize: "13px",
                marginTop: "2px",
                lineHeight: "1.4",
              }}
            >
              {msg.msg || msg.message}
            </Body>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
