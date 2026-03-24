"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default Leaflet icon paths broken in Next.js — patch manually
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function makeIcon(stale) {
  const color = stale ? "#6b7280" : "#00ed64"; // grey if stale, MongoDB green if fresh
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 28px; height: 28px;
        border-radius: 50% 50% 50% 0;
        background: ${color};
        border: 2px solid ${stale ? "#4b5563" : "#00684a"};
        transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        opacity: ${stale ? 0.5 : 1};
      "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

export default function MapInner({ tracks, mapitems, isStale }) {
  const mapRef = useRef(null);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Find a centre from the first track, fall back to a reasonable default
  const firstFresh = tracks.find((t) => t.j && t.l);
  const center = firstFresh ? [firstFresh.j, firstFresh.l] : [27.02, -81.26];

  return (
    <MapContainer
      ref={mapRef}
      center={center}
      zoom={14}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />

      {tracks.map((track) => {
        if (!track.j || !track.l) return null;
        const stale = isStale(track);
        const callsign = track.c || track.e || track._id;
        const lastUpdate = track.b ? new Date(track.b).toLocaleTimeString() : "unknown";

        return (
          <Marker
            key={track._id}
            position={[track.j, track.l]}
            icon={makeIcon(stale)}
          >
            <Tooltip permanent direction="top" offset={[0, -30]}>
              <span style={{ fontWeight: 600 }}>{callsign}</span>
              {stale && <span style={{ color: "#ef4444" }}> ⚠ STALE</span>}
            </Tooltip>
            <Popup>
              <strong>{callsign}</strong>
              <br />
              Type: {track.w || "—"}
              <br />
              Last update: {lastUpdate}
              <br />
              LAT: {track.j?.toFixed(5)}, LON: {track.l?.toFixed(5)}
              {stale && (
                <>
                  <br />
                  <span style={{ color: "#ef4444" }}>⚠ Position is stale</span>
                </>
              )}
            </Popup>
          </Marker>
        );
      })}

      {mapitems.map((item) => {
        if (!item.j || !item.l) return null;
        const label = item.c || item._id;
        return (
          <Marker
            key={item._id}
            position={[item.j, item.l]}
            icon={L.divIcon({
              className: "",
              html: `<div style="
                width:20px; height:20px;
                background:#f59e0b;
                border:2px solid #92400e;
                border-radius:3px;
              "></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            })}
          >
            <Popup>{label}</Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
