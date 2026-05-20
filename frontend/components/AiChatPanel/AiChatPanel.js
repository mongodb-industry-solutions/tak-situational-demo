"use client";

import { useState, useRef, useEffect } from "react";

function formatTime(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function AiChatPanel() {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [...m, { id: Date.now(), text, ts: Date.now() }]);
    setDraft("");
  }

  return (
    <div style={{
      height: 160,
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
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 14px", display: "flex", flexDirection: "column", gap: "4px" }}>
        {messages.length === 0 ? (
          <span style={{ color: "#374151", fontFamily: "monospace", fontSize: "11px" }}>No messages yet.</span>
        ) : (
          messages.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <span style={{ color: "#22c55e", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>
                {formatTime(m.ts)}
              </span>
              <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: "12px" }}>
                {m.text}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "6px", padding: "6px 10px", borderTop: "1px solid #1f2937", flexShrink: 0 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask the AI…"
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
          }}
        />
        <button
          onClick={send}
          disabled={!draft.trim()}
          style={{
            background: "none",
            border: "1px solid #1f2937",
            borderRadius: "4px",
            color: draft.trim() ? "#22c55e" : "#374151",
            fontSize: "10px",
            fontFamily: "monospace",
            fontWeight: 700,
            padding: "4px 10px",
            cursor: draft.trim() ? "pointer" : "default",
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
