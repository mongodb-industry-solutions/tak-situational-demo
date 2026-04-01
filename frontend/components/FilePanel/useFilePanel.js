"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

export function useFilePanel() {
  const fetchFiles = useCallback(async () => {
    const res = await fetch("/api/files");
    if (!res.ok) throw new Error("Failed to fetch files");
    return res.json();
  }, []);

  const { data: files, loading } = usePolling(fetchFiles, 5000);

  return { files: files || [], loading };
}
