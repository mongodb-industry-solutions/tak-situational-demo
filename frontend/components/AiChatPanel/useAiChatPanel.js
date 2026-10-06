"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// How often to re-check while the model is downloading or the backend is
// unreachable. Both are transient on a freshly started stack.
const WARMING_POLL_MS = 15000;
const UNREACHABLE_RETRY_MS = 10000;

// `callsigns` (optional) scopes the agent's data tools to those units, the
// same way filterByCallsign scopes the map, node list and chat. Omit it on the
// command center to let the AI see everything.
export function useAiChatPanel(callsigns = null) {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const [sessionId, setSessionId] = useState(null);
  // null = still checking. The panel renders nothing until we know, so it
  // doesn't flash in on deployments that have no LLM configured at all.
  const [status, setStatus] = useState(null);
  const bottomRef = useRef(null);

  // Stable key for the scope, so a new array literal on every render doesn't
  // look like a scope change.
  const scopeKey = useMemo(
    () => (callsigns && callsigns.length ? [...callsigns].sort().join(",") : ""),
    [callsigns]
  );

  // Separate conversation per scope. Sharing one session would replay history
  // from the unscoped command center (other units) into the scoped view.
  useEffect(() => {
    const storageKey = scopeKey ? `leafyai_session_id:${scopeKey}` : "leafyai_session_id";
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    setSessionId(id);
  }, [scopeKey]);

  // Is there an LLM backend, and is it ready? Keep checking while the answer is
  // transient:
  //   • enabled but not ready → the model is still downloading
  //   • unreachable           → the backend or proxy is down/rolling out
  // A definite "disabled" (no LLM configured) stops polling. A transport
  // failure must NOT be treated as disabled, or one failed request during a
  // rollout would hide the panel until a manual reload.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const retry = (ms) => {
      if (!cancelled) timer = setTimeout(check, ms);
    };

    async function check() {
      let data = null;
      try {
        const res = await fetch("/api/systemai/status", { cache: "no-store" });
        data = await res.json().catch(() => null);
        if (!res.ok || !data || data.unreachable) data = null;
      } catch {
        data = null;
      }
      if (cancelled) return;

      if (data === null) {
        // Keep whatever we last knew (null on first load = stay hidden).
        retry(UNREACHABLE_RETRY_MS);
        return;
      }
      setStatus(data);
      if (data.enabled && data.ready === false) retry(WARMING_POLL_MS);
    }

    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Submitting is only meaningful once the backend has said it's ready; while
  // warming up the request would just 503.
  const canSend = status?.enabled === true && status?.ready !== false;

  const sendMessage = useCallback(async () => {
    const msg = draft.trim();
    if (!msg || thinking || !sessionId || !canSend) return;

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
        body: JSON.stringify({
          msg,
          session_id: sessionId,
          ...(scopeKey ? { callsigns: scopeKey.split(",") } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface the backend's reason (e.g. "model is still downloading")
        // rather than a generic failure — on a fresh local cluster that message
        // is the difference between "broken" and "wait two minutes".
        throw new Error(data?.detail || data?.error || `Request failed (${res.status})`);
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
  }, [draft, thinking, sessionId, canSend, scopeKey]);

  return { messages, thinking, draft, setDraft, sendMessage, bottomRef, status, canSend };
}
