"use client";

import { Body, H3 } from "@leafygreen-ui/typography";
import { palette } from "@leafygreen-ui/palette";
import Button from "@leafygreen-ui/button";
import { useChatPanel } from "./useChatPanel";

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

export default function ChatPanel({ collapsed, onToggle }) {
  const { messages, loading, bottomRef, draft, setDraft, sending, sendMessage } = useChatPanel();

  return (
    <div style={{ backgroundColor: palette.gray.dark3, border: `1px solid ${palette.gray.dark2}`, borderRadius: "6px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ padding: "10px 16px", borderBottom: collapsed ? "none" : `1px solid ${palette.gray.dark2}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>COMMS FEED</H3>
        <Chevron open={!collapsed} />
      </div>

      {!collapsed && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {loading && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>Loading…</Body>}
            {!loading && messages.length === 0 && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>No messages yet.</Body>}
            {messages.map((msg) => (
              <div key={msg._id}>
                <div style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                  <span style={{ color: palette.green.base, fontWeight: 700, fontSize: "12px", fontFamily: "monospace", flexShrink: 0 }}>
                    {msg.e || msg.authorCallsign || "UNKNOWN"}
                  </span>
                  <span style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace" }}>
                    {formatTime(msg.b)}
                  </span>
                </div>
                <Body style={{ color: palette.gray.light2, fontSize: "13px", marginTop: "2px", lineHeight: "1.4" }}>
                  {msg.msg || msg.message}
                </Body>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: "10px 12px", borderTop: `1px solid ${palette.gray.dark2}`, display: "flex", gap: "8px", flexShrink: 0 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Send message to ATAK…"
              disabled={sending}
              style={{ flex: 1, backgroundColor: palette.gray.dark2, border: `1px solid ${palette.gray.dark1}`, borderRadius: "4px", color: palette.white, fontSize: "13px", fontFamily: "monospace", padding: "6px 10px", outline: "none" }}
            />
            <Button size="small" variant="primary" onClick={sendMessage} disabled={!draft.trim() || sending} isLoading={sending}>
              Send
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
