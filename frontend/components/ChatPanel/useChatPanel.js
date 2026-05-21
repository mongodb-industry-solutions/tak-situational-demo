"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

export function useChatPanel() {
  const bottomRef = useRef(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const fetchChat = useCallback(async () => {
    const res = await fetch("/api/chat");
    if (!res.ok) throw new Error("Failed to fetch chat");
    return res.json();
  }, []);

  const { data: messages, loading } = usePolling(fetchChat, 2000);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const msg = draft.trim();
    if (!msg || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      setDraft("");
    } finally {
      setSending(false);
    }
  }, [draft, sending]);

  const sendQuick = useCallback(async (text) => {
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ msg: text }),
      });
      if (!res.ok) throw new Error("Failed to send message");
    } finally {
      setSending(false);
    }
  }, [sending]);

  return { messages: messages || [], loading, bottomRef, draft, setDraft, sending, sendMessage, sendQuick };
}
