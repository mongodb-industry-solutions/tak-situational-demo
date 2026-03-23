"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

const STALE_THRESHOLD_MS = 0; // use doc.o field directly

export function isStale(doc) {
  if (!doc.o) return false;
  return Date.now() > doc.o;
}

export function useMap() {
  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    if (!res.ok) throw new Error("Failed to fetch tracks");
    return res.json();
  }, []);

  const fetchMapitems = useCallback(async () => {
    const res = await fetch("/api/mapitems");
    if (!res.ok) throw new Error("Failed to fetch mapitems");
    return res.json();
  }, []);

  const { data: tracks, loading: tracksLoading } = usePolling(fetchTracks, 2000);
  const { data: mapitems, loading: mapitemsLoading } = usePolling(fetchMapitems, 5000);

  return {
    tracks: tracks || [],
    mapitems: mapitems || [],
    loading: tracksLoading && mapitemsLoading,
  };
}
