"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import NavBar from "@/components/NavBar/NavBar";
import { useFeatures } from "@/lib/hooks/useFeatures";
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

// Both devices start in the same AO (a few km apart) so they read as one team.
const ALPHA_START = GPS_PRESETS[0]; // Camp Pendleton
const BRAVO_START = { label: GPS_PRESETS[0].label, lat: GPS_PRESETS[0].lat + 0.012, lng: GPS_PRESETS[0].lng + 0.014 };

// Every device this view knows how to drive. Which ones actually render comes
// from the backend (/api/features → simulateDevices): only devices with a
// configured Genymotion host + token. Production, for instance, has ALPHA but
// no BRAVO yet, and must not show a BRAVO panel that can never connect.
const DEVICE_CONFIG = {
  alpha: { callsign: "ALPHA", title: "FIELD DEVICE — ALPHA", preset: ALPHA_START },
  bravo: { callsign: "BRAVO", title: "FIELD DEVICE — BRAVO", preset: BRAVO_START },
};

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
  const [renderers, setRenderers] = useState({});
  const [startSignal, setStartSignal] = useState(0);
  const features = useFeatures();

  // Configured devices, in display order, and the callsigns the command-center
  // panels are filtered to. Memoised so the panels get a stable array.
  const devices = useMemo(
    () => (features?.simulateDevices ?? []).filter((d) => DEVICE_CONFIG[d]),
    [features]
  );
  const simCallsigns = useMemo(() => devices.map((d) => DEVICE_CONFIG[d].callsign), [devices]);
  // One stable onReady per device. GenymotionEmulator lists onReady in its
  // effect/callback dependencies, so an inline arrow (new identity every
  // render) would make it re-run teardown/connect logic on every render.
  const onReadyByDevice = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(DEVICE_CONFIG).map((d) => [d, (r) => setRenderers((prev) => ({ ...prev, [d]: r }))])
      ),
    []
  );

  // This view needs Genymotion PaaS instances that only exist in the internal
  // deployment, so it is gated on ENABLE_SIMULATE. The NavBar already hides the
  // link; this guards direct navigation to /simulate so an external user who
  // guesses the URL gets a clear message instead of a wall of failing device
  // panels.
  if (features === null) return null;
  if (features.simulate !== true) {
    return (
      <main style={{ backgroundColor: "#0d1117", height: "100vh", display: "flex", flexDirection: "column" }}>
        <NavBar />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 520, textAlign: "center", fontFamily: "monospace" }}>
            <p style={{ color: palette.yellow.base, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em" }}>
              SIMULATE VIEW DISABLED
            </p>
            <p style={{ color: palette.gray.base, fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
              This view drives emulated ATAK devices hosted on Genymotion, which is
              internal infrastructure and currently paused. It is off unless
              <code style={{ color: palette.gray.light1 }}> ENABLE_SIMULATE=true</code> and at
              least one Genymotion device is configured.
            </p>
            <p style={{ color: palette.gray.dark1, fontSize: 12, lineHeight: 1.6, marginTop: 12 }}>
              To feed the dashboard locally, pair a real Android device running ATAK
              CIV with the self-hosted Ditto Big Peer — see docs/RUN_LOCAL.md, or use
              “Add Device” in the top bar.
            </p>
            <Link href="/" style={{ color: "#22c55e", fontSize: 12, display: "inline-block", marginTop: 20 }}>
              ← Back to the command center
            </Link>
          </div>
        </div>
      </main>
    );
  }

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

          {devices.map((d) => {
            const cfg = DEVICE_CONFIG[d];
            return (
              <div key={d} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <GenymotionEmulator
                  label={d}
                  title={cfg.title}
                  fluid
                  startSignal={startSignal}
                  onReady={onReadyByDevice[d]}
                />
                <GpsControl label={cfg.callsign} renderer={renderers[d] ?? null} preset={cfg.preset} />
              </div>
            );
          })}
        </div>

        {/* RIGHT — clean command center, filtered to the configured devices */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "12px", overflow: "hidden" }}>
          <div style={{ width: 240, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <NodeStatus callsigns={simCallsigns} />
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ flex: 1, minHeight: 0, borderRadius: "6px", overflow: "hidden", position: "relative", zIndex: 0 }}>
              <Map callsigns={simCallsigns} />
            </div>
            {/* Same scope as the other panels, so the AI can't report units this
                view hides. */}
            <AiChatPanel callsigns={simCallsigns} />
          </div>
          <div style={{ width: 260, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <ChatPanel callsigns={simCallsigns} />
          </div>
        </div>

      </div>
    </main>
  );
}
