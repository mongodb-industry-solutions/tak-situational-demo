"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";

export function useTelemetryPanel() {
  const fetchTelemetry = useCallback(async () => {
    const res = await fetch("/api/telemetry");
    if (!res.ok) throw new Error("Failed to fetch telemetry");
    return res.json();
  }, []);

  const { data, loading } = usePolling(fetchTelemetry, 5000);

  return { readings: data || [], loading };
}
