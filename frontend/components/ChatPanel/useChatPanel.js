"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

export function useChatPanel() {
  const bottomRef = useRef(null);

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

  return { messages: messages || [], loading, bottomRef };
}
