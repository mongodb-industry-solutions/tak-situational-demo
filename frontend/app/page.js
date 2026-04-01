"use client";

import NavBar from "@/components/NavBar/NavBar";
import Map from "@/components/Map/Map";
import ChatPanel from "@/components/ChatPanel/ChatPanel";
import NodeStatus from "@/components/NodeStatus/NodeStatus";
import AlertPanel from "@/components/AlertPanel/AlertPanel";

export default function Home() {
  return (
    <main
      style={{
        backgroundColor: "#0d1117",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <NavBar />

      {/* Dashboard grid */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gridTemplateRows: "1fr 180px 260px",
          gap: "12px",
          padding: "12px",
        }}
      >
        {/* Map — spans all three rows on the left */}
        <div style={{ gridRow: "1 / 4", borderRadius: "6px", overflow: "hidden", minHeight: 0, position: "relative", zIndex: 0 }}>
          <Map />
        </div>

        {/* Node status — top right */}
        <div style={{ gridRow: "1", overflow: "hidden" }}>
          <NodeStatus />
        </div>

        {/* Alerts — middle right */}
        <div style={{ gridRow: "2", overflow: "hidden" }}>
          <AlertPanel />
        </div>

        {/* Chat — bottom right */}
        <div style={{ gridRow: "3", overflow: "hidden" }}>
          <ChatPanel />
        </div>
      </div>
    </main>
  );
}
