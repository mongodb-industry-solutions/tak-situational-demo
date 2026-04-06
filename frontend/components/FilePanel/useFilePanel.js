"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

export function useFilePanel() {
  const fetchFiles = useCallback(async () => {
    const res = await fetch("/api/files");
    if (!res.ok) throw new Error("Failed to fetch files");
    return res.json();
  }, []);

  const { data: files, loading, refresh } = usePolling(fetchFiles, 2000);

  const deleteFile = useCallback(async (fileId) => {
    const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete file");
    refresh();
  }, [refresh]);

  return { files: files || [], loading, deleteFile };
}
