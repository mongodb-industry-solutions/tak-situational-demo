"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

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

  const fetchAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
  }, []);

  const { data: tracks, loading: tracksLoading } = usePolling(fetchTracks, 2000);
  const { data: mapitems, loading: mapitemsLoading } = usePolling(fetchMapitems, 2000);
  const { data: alerts } = usePolling(fetchAlerts, 2000);

  const placeMarker = useCallback(async (lat, lon, label, markerType) => {
    const res = await fetch("/api/mapitems", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lon, label, marker_type: markerType }),
    });
    if (!res.ok) throw new Error("Failed to place marker");
    return res.json();
  }, []);

  const deleteMarker = useCallback(async (id) => {
    const res = await fetch(`/api/mapitems?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete marker");
    return res.json();
  }, []);

  return {
    tracks: tracks || [],
    mapitems: mapitems || [],
    alerts: alerts || [],
    loading: tracksLoading || mapitemsLoading,
    placeMarker,
    deleteMarker,
  };
}
