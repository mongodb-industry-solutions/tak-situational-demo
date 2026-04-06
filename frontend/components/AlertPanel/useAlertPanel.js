"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

export function useAlertPanel() {
  const fetchAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
  }, []);

  const { data: alerts, loading } = usePolling(fetchAlerts, 2000);

  return { alerts: alerts || [], loading };
}
