"use client";

import dynamic from "next/dynamic";
import { useMap, isStale } from "./useMap";

// Leaflet requires browser APIs — disable SSR
const MapInner = dynamic(() => import("./MapInner"), { ssr: false });

export default function Map() {
  const { tracks, mapitems, loading } = useMap();

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-gray-900 text-gray-400 text-sm">
        Loading map…
      </div>
    );
  }

  return <MapInner tracks={tracks} mapitems={mapitems} isStale={isStale} />;
}
