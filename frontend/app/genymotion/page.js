"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import NavBar from "@/components/NavBar/NavBar";
import { palette } from "@leafygreen-ui/palette";
import GpsControl, { GPS_PRESETS } from "@/components/GpsControl/GpsControl";

const GenymotionEmulator = dynamic(
  () => import("@/components/GenymotionEmulator/GenymotionEmulator"),
  { ssr: false, loading: () => <DeviceSkeleton /> }
);

function DeviceSkeleton() {
  return (
    <div style={{
      width: 640, height: 360, backgroundColor: "#1a1a1a", borderRadius: 12,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: palette.gray.dark1, fontFamily: "monospace", fontSize: 11 }}>Loading…</span>
    </div>
  );
}

function DeviceLabel({ name, subtitle }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ color: palette.white, fontFamily: "monospace", fontSize: 13, fontWeight: 700 }}>
        {name}
      </span>
      <span style={{ color: palette.gray.base, fontFamily: "monospace", fontSize: 10 }}>
        {subtitle}
      </span>
    </div>
  );
}

export default function GenymotionPage() {
  const [renderer1, setRenderer1] = useState(null);
  const [renderer2, setRenderer2] = useState(null);

  return (
    <main style={{
      backgroundColor: "#0d1117",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <NavBar />

      <div style={{
        flex: 1, minHeight: 0, display: "flex", padding: "16px", gap: "24px", overflow: "hidden",
      }}>
        {/* LEFT — two stacked field devices */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 16, flexShrink: 0, overflowY: "auto",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DeviceLabel name="FIELD DEVICE — ALPHA-1" subtitle="ATAK CIV · Genymotion ARM64" />
            <GenymotionEmulator label="alpha-1" onReady={setRenderer1} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <DeviceLabel name="FIELD DEVICE — ALPHA-2" subtitle="ATAK CIV · Genymotion ARM64" />
            <GenymotionEmulator label="alpha-2" onReady={setRenderer2} />
          </div>
        </div>

        {/* RIGHT — controls */}
        <div style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto",
        }}>
          <div style={{
            backgroundColor: "#161b22",
            border: `1px solid ${palette.gray.dark2}`,
            borderRadius: 8,
            padding: "10px 14px",
          }}>
            <span style={{ color: palette.green.base, fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
              GENYMOTION VIEW
            </span>
            <p style={{ color: palette.gray.light1, fontFamily: "monospace", fontSize: 10, margin: "6px 0 0", lineHeight: 1.6 }}>
              START a device → it boots ATAK from the recipe and drops onto its preset location (off the globe).
              SIMULATE MOVEMENT walks the GPS so the track moves and propagates through Ditto → Atlas → dashboard.
            </p>
          </div>

          <GpsControl label="ALPHA-1" renderer={renderer1} preset={GPS_PRESETS[0]} />
          <GpsControl label="ALPHA-2" renderer={renderer2} preset={GPS_PRESETS[1]} />
        </div>
      </div>
    </main>
  );
}
