"use client";

import { useCallback } from "react";
import { usePolling } from "@/lib/hooks/usePolling";
import { isStale } from "@/components/Map/useMap";
import { filterByCallsign } from "@/lib/filterByCallsign";

const SENTINEL = 9999999;

function clean(v) {
  const f = parseFloat(v);
  return !isNaN(f) && Math.abs(f) < SENTINEL ? f : null;
}

function parseBattery(xml) {
  if (!xml) return null;
  const m = xml.match(/battery='(\d+)'/);
  return m ? parseInt(m[1], 10) : null;
}

function parseGroup(xml) {
  if (!xml) return null;
  const nameM = xml.match(/<__group[^>]*\bname='([^']*)'/);
  const roleM = xml.match(/<__group[^>]*\brole='([^']*)'/);
  if (!nameM && !roleM) return null;
  return { team: nameM?.[1] ?? null, role: roleM?.[1] ?? null };
}

export function useNodeStatus(callsigns) {
  const fetchTracks = useCallback(async () => {
    const res = await fetch("/api/tracks");
    if (!res.ok) throw new Error("Failed to fetch tracks");
    return res.json();
  }, []);

  const fetchAlerts = useCallback(async () => {
    const res = await fetch("/api/alerts");
    if (!res.ok) throw new Error("Failed to fetch alerts");
    return res.json();
  }, []);

  const fetchTelemetry = useCallback(async () => {
    const res = await fetch("/api/telemetry");
    if (!res.ok) throw new Error("Failed to fetch telemetry");
    return res.json();
  }, []);

  const { data: tracks, loading } = usePolling(fetchTracks, 2000);
  const { data: alerts } = usePolling(fetchAlerts, 2000);
  const { data: telemetry } = usePolling(fetchTelemetry, 5000);

  const alertList = Array.isArray(alerts) ? alerts : [];
  const telemList = Array.isArray(telemetry) ? telemetry : [];

  const nodes = filterByCallsign(tracks, callsigns).map((t) => {
    const group = parseGroup(t.r);
    const callsign = t.c || t.e || t._id;
    const nodeAlert = alertList.find((a) => (a.c || a.e) === callsign) ?? null;
    const nodeTelem = telemList.find((tel) => (tel.c || tel.e) === callsign) ?? null;
    return {
      id: t._id,
      callsign,
      cotType: t.w || null,
      lastUpdateMs: t.b,
      stale: isStale(t),
      lat: t.j,
      lon: t.l,
      speedMs: clean(t.r1),
      courseDeg: clean(t.r2),
      altM: clean(t.i),
      ceM: clean(t.h),
      battery: parseBattery(t.r),
      team: group?.team ?? null,
      role: group?.role ?? null,
      alert: nodeAlert,
      telemetry: nodeTelem,
    };
  });

  return { nodes, loading };
}
