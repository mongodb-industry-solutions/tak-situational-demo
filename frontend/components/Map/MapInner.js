"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
// Default Leaflet icon paths broken in Next.js — patch manually
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

// ── Track icon (PLI marker) ───────────────────────────────────────────────────
function makeIcon(stale) {
  const color = stale ? "#6b7280" : "#00ed64";
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

// ── Marker type definitions ───────────────────────────────────────────────────
const MARKER_TYPES = [
  { type: "a-f-G", letter: "F", fill: "#3b82f6", border: "#1d4ed8", label: "Friendly" },
  { type: "a-n-G", letter: "N", fill: "#22c55e", border: "#15803d", label: "Neutral" },
  { type: "a-u-G", letter: "U", fill: "#eab308", border: "#a16207", label: "Unknown" },
  { type: "a-h-G", letter: "H", fill: "#ef4444", border: "#991b1b", label: "Hostile" },
];

const MARKER_COLORS = {
  "a-f-G": { fill: "#3b82f6", border: "#1d4ed8" },
  "a-n-G": { fill: "#22c55e", border: "#15803d" },
  "a-u-G": { fill: "#eab308", border: "#a16207" },
  "a-h-G": { fill: "#ef4444", border: "#991b1b" },
};
const DEFAULT_MARKER_COLOR = { fill: "#f59e0b", border: "#92400e" };

// ── Mapitem icons (MIL-STD 2525 shapes) ──────────────────────────────────────
function makeMapitemIcon(w) {
  const { fill, border } = MARKER_COLORS[w] || DEFAULT_MARKER_COLOR;

  switch (w) {
    case "a-f-G":
      return L.divIcon({
        className: "",
        html: `<div style="width:28px;height:16px;background:${fill};border:2px solid ${border};border-radius:2px;"></div>`,
        iconSize: [28, 16],
        iconAnchor: [14, 8],
        popupAnchor: [0, -12],
      });
    case "a-h-G":
      return L.divIcon({
        className: "",
        html: `<div style="width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
          <div style="width:14px;height:14px;background:${fill};border:2px solid ${border};transform:rotate(45deg);"></div>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -15],
      });
    case "a-u-G":
      return L.divIcon({
        className: "",
        html: `<svg width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
          <rect x="6" y="0" width="10" height="22" rx="3" fill="${fill}" stroke="${border}" stroke-width="1.5"/>
          <rect x="0" y="6" width="22" height="10" rx="3" fill="${fill}" stroke="${border}" stroke-width="1.5"/>
        </svg>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -15],
      });
    default:
      return L.divIcon({
        className: "",
        html: `<div style="width:20px;height:20px;background:${fill};border:2px solid ${border};border-radius:2px;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -14],
      });
  }
}

// ── Cursor manager ────────────────────────────────────────────────────────────
function CursorManager({ mode, placing }) {
  const map = useMap();
  useEffect(() => {
    if (placing) {
      map.getContainer().style.cursor = "wait";
    } else {
      map.getContainer().style.cursor = mode === "marker" ? "crosshair" : "";
    }
  }, [map, mode, placing]);
  return null;
}

// ── Click-to-place handler ────────────────────────────────────────────────────
function MarkerPlacer({ active, onMapClick }) {
  useMapEvents({
    click(e) {
      if (!active) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Fixed-width side toolbar (never changes size) ─────────────────────────────
function MapToolbar({ mode, onModeChange }) {
  const panelStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    background: "rgba(17, 24, 39, 0.92)",
    border: "1px solid #374151",
    borderRadius: "6px",
    padding: "4px",
  };

  const btnStyle = (active) => ({
    width: "36px",
    height: "36px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    border: "none",
    cursor: "pointer",
    background: active ? "#3b82f6" : "transparent",
    color: active ? "#fff" : "#9ca3af",
  });

  return (
    <div style={panelStyle}>
      <button title="Pan / Move" onClick={() => onModeChange("pan")} style={btnStyle(mode === "pan")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5 9 2 12 5 15"/>
          <polyline points="9 5 12 2 15 5"/>
          <polyline points="15 19 12 22 9 19"/>
          <polyline points="19 9 22 12 19 15"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <line x1="12" y1="2" x2="12" y2="22"/>
        </svg>
      </button>

      <button title="Place Marker" onClick={() => onModeChange("marker")} style={btnStyle(mode === "marker")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a7 7 0 00-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 00-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z"/>
        </svg>
      </button>
    </div>
  );
}

// ── Marker submenu (appears to the right of the toolbar) ──────────────────────
function MarkerSubmenu({ markerType, onMarkerTypeChange, prefix, onPrefixChange, nextLabel, placing }) {
  const activeType = MARKER_TYPES.find((t) => t.type === markerType);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        background: "rgba(17, 24, 39, 0.92)",
        border: "1px solid #374151",
        borderRadius: "6px",
        padding: "8px",
        minWidth: "150px",
      }}
    >
      {/* Type selector */}
      <div style={{ display: "flex", gap: "4px" }}>
        {MARKER_TYPES.map(({ type, letter, fill, border, label }) => (
          <button
            key={type}
            title={label}
            onClick={() => onMarkerTypeChange(type)}
            style={{
              flex: 1,
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              border: `2px solid ${markerType === type ? fill : "#374151"}`,
              cursor: "pointer",
              background: markerType === type ? fill : "transparent",
              color: markerType === type ? "#fff" : fill,
              fontSize: "13px",
              fontWeight: 700,
            }}
          >
            {letter}
          </button>
        ))}
      </div>

      {/* Prefix */}
      <div>
        <div style={{ fontSize: "10px", color: "#6b7280", marginBottom: "3px", letterSpacing: "0.05em" }}>PREFIX</div>
        <input
          value={prefix}
          onChange={(e) => onPrefixChange(e.target.value)}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "3px",
            color: "#e5e7eb",
            fontSize: "12px",
            padding: "4px 6px",
            outline: "none",
          }}
        />
      </div>

      {/* Next label preview */}
      <div>
        <div style={{ fontSize: "10px", color: "#6b7280", marginBottom: "3px", letterSpacing: "0.05em" }}>NEXT</div>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: placing ? "#6b7280" : (activeType?.fill || "#e5e7eb"),
            background: "#1f2937",
            border: `1px solid ${placing ? "#374151" : (activeType?.border || "#374151")}`,
            borderRadius: "3px",
            padding: "4px 6px",
          }}
        >
          {placing ? "Placing…" : nextLabel}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapInner({ tracks, mapitems, isStale, onPlaceMarker, onDeleteMarker }) {
  const mapRef = useRef(null);
  const [mapMode, setMapMode] = useState("pan");
  const [markerType, setMarkerType] = useState("a-f-G");
  const [prefix, setPrefix] = useState("COMMAND");
  const [counter, setCounter] = useState(1);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const nextLabel = prefix.trim() ? `${prefix.trim()}-${counter}` : String(counter);

  const handleMapClick = useCallback(async (lat, lng) => {
    if (placing) return;
    setPlacing(true);
    const label = prefix.trim() ? `${prefix.trim()}-${counter}` : String(counter);
    try {
      await onPlaceMarker(lat, lng, label, markerType);
      setCounter((c) => c + 1);
    } finally {
      setPlacing(false);
    }
  }, [placing, prefix, counter, markerType, onPlaceMarker]);

  const firstFresh = tracks.find((t) => t.j != null && t.l != null);
  const center = firstFresh ? [firstFresh.j, firstFresh.l] : [27.02, -81.26];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        <CursorManager mode={mapMode} placing={placing} />

        {tracks.map((track) => {
          if (track.j == null || track.l == null) return null;
          const stale = isStale(track);
          const callsign = track.c || track.e || track._id;
          const lastUpdate = track.b ? new Date(track.b).toLocaleTimeString() : "unknown";
          return (
            <Marker key={track._id} position={[track.j, track.l]} icon={makeIcon(stale)}>
              <Tooltip permanent direction="top" offset={[0, -30]}>
                <span style={{ fontWeight: 600 }}>{callsign}</span>
                {stale && <span style={{ color: "#ef4444" }}> ⚠ STALE</span>}
              </Tooltip>
              <Popup>
                <strong>{callsign}</strong>
                <br />Type: {track.w || "—"}
                <br />Last update: {lastUpdate}
                <br />LAT: {track.j?.toFixed(5)}, LON: {track.l?.toFixed(5)}
                {stale && <><br /><span style={{ color: "#ef4444" }}>⚠ Position is stale</span></>}
              </Popup>
            </Marker>
          );
        })}

        {mapitems.map((item) => {
          if (item.j == null || item.l == null) return null;
          const label = item.c || item._id;
          return (
            <Marker key={item._id} position={[item.j, item.l]} icon={makeMapitemIcon(item.w)}>
              <Popup>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "120px" }}>
                  <strong style={{ fontSize: "13px" }}>{label}</strong>
                  <button
                    onClick={() => onDeleteMarker(item._id)}
                    style={{
                      fontSize: "12px",
                      cursor: "pointer",
                      color: "#ef4444",
                      background: "none",
                      border: "1px solid #ef4444",
                      borderRadius: "3px",
                      padding: "2px 6px",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <MarkerPlacer active={mapMode === "marker"} onMapClick={handleMapClick} />
      </MapContainer>

      {/* Toolbar wrapper — flex row so submenu sits naturally to the right */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "10px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "row",
          gap: "6px",
          alignItems: "flex-start",
        }}
      >
        <MapToolbar mode={mapMode} onModeChange={setMapMode} />
        {mapMode === "marker" && (
          <MarkerSubmenu
            markerType={markerType}
            onMarkerTypeChange={setMarkerType}
            prefix={prefix}
            onPrefixChange={setPrefix}
            nextLabel={nextLabel}
            placing={placing}
          />
        )}
      </div>
    </div>
  );
}
