"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function usePolling(fetchFn, intervalMs = 2000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const poll = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const result = await fetchFn();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      if (mounted.current) setLoading(false);
      inFlight.current = false;
    }
  }, [fetchFn]);

  useEffect(() => {
    mounted.current = true;
    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [poll, intervalMs]);

  return { data, error, loading };
}
