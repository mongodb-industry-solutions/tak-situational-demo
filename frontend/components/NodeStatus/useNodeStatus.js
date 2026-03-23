"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";
import { isStale } from "@/components/Map/useMap";

export function useNodeStatus() {
  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    if (!res.ok) throw new Error("Failed to fetch tracks");
    return res.json();
  }, []);

  const { data: tracks, loading } = usePolling(fetchTracks, 2000);

  const nodes = (tracks || []).map((t) => ({
    id: t._id,
    callsign: t.c || t.e || t._id,
    cotType: t.w || "—",
    lastUpdateMs: t.b,
    stale: isStale(t),
    lat: t.j,
    lon: t.l,
  }));

  return { nodes, loading };
}
