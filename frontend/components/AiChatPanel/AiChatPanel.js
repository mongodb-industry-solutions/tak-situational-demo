"use client";

import { useAiChatPanel } from "./useAiChatPanel";

function formatTime(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function AiChatPanel() {
  const { messages, thinking, draft, setDraft, sendMessage, bottomRef } = useAiChatPanel();

  return (
    <div style={{
      height: 200,
      flexShrink: 0,
      borderRadius: "6px",
      border: "1px solid #1f2937",
      backgroundColor: "#111827",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "6px 14px", borderBottom: "1px solid #1f2937", flexShrink: 0, display: "flex", alignItems: "center" }}>
        <span style={{ color: "#22c55e", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em" }}>
          SYSTEM AI
        </span>
      </div>

      {/* Message history */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
        {messages.length === 0 && !thinking && (
          <span style={{ color: "#374151", fontFamily: "monospace", fontSize: "11px" }}>
            Ask LEAFY-AI about the tactical situation…
          </span>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            {m.role === "user" ? (
              <>
                <span style={{ color: "#22c55e", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, flexShrink: 0, paddingTop: "1px" }}>
                  [{formatTime(m.ts)}]
                </span>
                <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: "12px", lineHeight: "1.5" }}>
                  {m.text}
                </span>
              </>
            ) : (
              <>
                <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, flexShrink: 0, paddingTop: "1px" }}>
                  LEAFY-AI
                </span>
                <span style={{ color: "#e5e7eb", fontFamily: "monospace", fontSize: "12px", lineHeight: "1.5" }}>
                  {m.text}
                </span>
              </>
            )}
          </div>
        ))}

        {thinking && (
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
            <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, flexShrink: 0, opacity: 0.6 }}>
              LEAFY-AI
            </span>
            <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: "12px", opacity: 0.6 }}>
              PROCESSING…
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "6px", padding: "6px 10px", borderTop: "1px solid #1f2937", flexShrink: 0 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask the AI…"
          disabled={thinking}
          style={{
            flex: 1,
            backgroundColor: "#0d1117",
            border: "1px solid #1f2937",
            borderRadius: "4px",
            color: "#e5e7eb",
            fontSize: "12px",
            fontFamily: "monospace",
            padding: "4px 8px",
            outline: "none",
            opacity: thinking ? 0.5 : 1,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!draft.trim() || thinking}
          style={{
            background: "none",
            border: "1px solid #1f2937",
            borderRadius: "4px",
            color: draft.trim() && !thinking ? "#22c55e" : "#374151",
            fontSize: "10px",
            fontFamily: "monospace",
            fontWeight: 700,
            padding: "4px 10px",
            cursor: draft.trim() && !thinking ? "pointer" : "default",
            letterSpacing: "0.06em",
            flexShrink: 0,
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
