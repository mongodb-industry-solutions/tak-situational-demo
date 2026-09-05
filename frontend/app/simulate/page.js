"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import NavBar from "@/components/NavBar/NavBar";
import Map from "@/components/Map/Map";
import ChatPanel from "@/components/ChatPanel/ChatPanel";
import NodeStatus from "@/components/NodeStatus/NodeStatus";
import AiChatPanel from "@/components/AiChatPanel/AiChatPanel";
import GpsControl, { GPS_PRESETS } from "@/components/GpsControl/GpsControl";
import { palette } from "@leafygreen-ui/palette";

const GenymotionEmulator = dynamic(
  () => import("@/components/GenymotionEmulator/GenymotionEmulator"),
  { ssr: false, loading: () => <DeviceSkeleton /> }
);

// The clean command center shows ONLY the 2 field devices. ALPHA/BRAVO are fresh
// callsigns with no history, so nodes/chat/markers start empty and fill only with
// sim activity. (Command-originated chat/markers are intentionally excluded — they'd
// pull in historical COMMAND test data and break the "just the 2 devices" view.)
const SIM_CALLSIGNS = ["ALPHA", "BRAVO"];

// Both devices start in the same AO (a few km apart) so they read as one team.
const ALPHA_START = GPS_PRESETS[0]; // Camp Pendleton
const BRAVO_START = { label: GPS_PRESETS[0].label, lat: GPS_PRESETS[0].lat + 0.012, lng: GPS_PRESETS[0].lng + 0.014 };

function DeviceSkeleton() {
  return (
    <div style={{
      flex: 1, minHeight: 0, backgroundColor: "#1a1a1a", borderRadius: 12,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ color: palette.gray.dark1, fontFamily: "monospace", fontSize: 11 }}>Loading…</span>
    </div>
  );
}

export default function SimulatePage() {
  const [rendererA, setRendererA] = useState(null);
  const [rendererB, setRendererB] = useState(null);
  const [startSignal, setStartSignal] = useState(0);

  return (
    <main style={{ backgroundColor: "#0d1117", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <NavBar />

      <div style={{ flex: 1, minHeight: 0, display: "flex", padding: "12px", gap: "16px", overflow: "hidden" }}>

        {/* LEFT — simulated field devices. A border is the only division from the
            command center on the right; the header above already states the split. */}
        <div style={{
          width: 620, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12,
          minHeight: 0, paddingRight: 16, borderRight: `1px solid ${palette.gray.dark2}`,
        }}>
          <button
            onClick={() => setStartSignal((s) => s + 1)}
            style={{
              backgroundColor: "#166534", border: "1px solid #22c55e", borderRadius: 6, color: palette.white,
              fontFamily: "monospace", fontSize: 13, fontWeight: 700, padding: "8px 12px", cursor: "pointer",
              letterSpacing: "0.05em", flexShrink: 0,
            }}
          >
            ▶ START SIMULATION
          </button>

          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <GenymotionEmulator label="alpha" title="FIELD DEVICE — ALPHA" fluid startSignal={startSignal} onReady={setRendererA} />
            <GpsControl label="ALPHA" renderer={rendererA} preset={ALPHA_START} />
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <GenymotionEmulator label="bravo" title="FIELD DEVICE — BRAVO" fluid startSignal={startSignal} onReady={setRendererB} />
            <GpsControl label="BRAVO" renderer={rendererB} preset={BRAVO_START} />
          </div>
        </div>

        {/* RIGHT — clean command center (filtered to the 2 devices) */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "12px", overflow: "hidden" }}>
          <div style={{ width: 240, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <NodeStatus callsigns={SIM_CALLSIGNS} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ flex: 1, minHeight: 0, borderRadius: "6px", overflow: "hidden", position: "relative", zIndex: 0 }}>
              <Map callsigns={SIM_CALLSIGNS} />
            </div>
            <AiChatPanel />
          </div>
          <div style={{ width: 260, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <ChatPanel callsigns={SIM_CALLSIGNS} />
          </div>
        </div>

      </div>
    </main>
  );
}
