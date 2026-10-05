"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useAiChatPanel() {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState(null);
  // null = still checking. The panel renders nothing until we know, so it
  // doesn't flash in on deployments that have no LLM configured at all.
  const [status, setStatus] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    let id = localStorage.getItem("leafyai_session_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("leafyai_session_id", id);
    }
    setSessionId(id);
  }, []);

  // Is there an LLM backend, and is it ready? On the local stack Ollama is up
  // long before its model finishes downloading, so poll until ready to flip the
  // panel from "warming up" to usable without needing a page reload.
  useEffect(() => {
    let cancelled = false;
    let timer;

    const check = async () => {
      try {
        const res = await fetch("/api/systemai/status");
        const data = await res.json();
        if (cancelled) return;
        setStatus(data);
        // Keep polling only while enabled-but-not-ready (model downloading).
        if (data?.enabled && data?.ready === false) {
          timer = setTimeout(check, 15000);
        }
      } catch {
        if (!cancelled) setStatus({ enabled: false, ready: false });
      }
    };

    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the backend's reason (e.g. "model is still downloading")
        // rather than a generic failure — on a fresh local cluster that message
        // is the difference between "broken" and "wait two minutes".
        throw new Error(data?.error || data?.detail || `Request failed (${res.status})`);
      }
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "ai", text: data.reply, ts: Date.now() },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "ai",
          text: `LEAFY-AI OFFLINE — ${err.message || "connection error."}`,
          ts: Date.now(),
        },
      ]);
    } finally {
      setThinking(false);
    }
  }, [draft, thinking, sessionId]);

  return { messages, thinking, draft, setDraft, sendMessage, bottomRef, status };
}
