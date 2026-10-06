"use client";

import { useAiChatPanel } from "./useAiChatPanel";

function formatTime(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

// `callsigns` (optional) scopes the AI to those units — pass the same list the
// other panels on the page are filtered by.
export default function AiChatPanel({ callsigns = null } = {}) {
  const { messages, thinking, draft, setDraft, sendMessage, bottomRef, status, canSend } =
    useAiChatPanel(callsigns);

  // Render nothing until the status check resolves, then hide the panel
  // entirely when no LLM backend is configured. A clone with no Ollama and no
  // gateway key gets a clean dashboard instead of a panel that errors on every
  // question — the map, node status and comms feed are the demo's core.
  if (status === null || status.enabled !== true) return null;

  // Configured but still downloading the model (normal right after `make setup`).
  const warming = status.ready === false;
  // Every submit path (typing, Enter, SEND) is blocked while busy or warming.
  const inputLocked = thinking || !canSend;
  const sendable = !inputLocked && draft.trim().length > 0;

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
        {warming && (
          <span style={{ color: "#f59e0b", fontFamily: "monospace", fontSize: "10px", marginLeft: "10px", opacity: 0.8 }}>
            {status.detail || "warming up…"}
          </span>
        )}
      </div>

      {/* Message history */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
        {messages.length === 0 && !thinking && (
          <span style={{ color: "#374151", fontFamily: "monospace", fontSize: "11px" }}>
            {warming
              ? "Model is still downloading — this panel will come online shortly."
              : "Ask LEAFY-AI about the tactical situation…"}
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
          onKeyDown={(e) => e.key === "Enter" && sendable && sendMessage()}
          placeholder={warming ? "Model downloading…" : "Ask the AI…"}
          disabled={inputLocked}
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
            opacity: inputLocked ? 0.5 : 1,
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!sendable}
          style={{
            background: "none",
            border: "1px solid #1f2937",
            borderRadius: "4px",
            color: sendable ? "#22c55e" : "#374151",
            fontSize: "10px",
            fontFamily: "monospace",
            fontWeight: 700,
            padding: "4px 10px",
            cursor: sendable ? "pointer" : "default",
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
