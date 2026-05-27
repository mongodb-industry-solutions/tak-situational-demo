"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useAiChatPanel() {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    let id = localStorage.getItem("leafyai_session_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("leafyai_session_id", id);
    }
    setSessionId(id);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const sendMessage = useCallback(async () => {
    const msg = draft.trim();
    if (!msg || thinking || !sessionId) return;

    setDraft("");
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", text: msg, ts: Date.now() },
    ]);
    setThinking(true);

    try {
      const res = await fetch("/api/systemai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg, session_id: sessionId }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "ai", text: data.reply, ts: Date.now() },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "ai", text: "LEAFY-AI OFFLINE — connection error.", ts: Date.now() },
      ]);
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, sessionId]);

  return { messages, thinking, draft, setDraft, sendMessage, bottomRef };
}
