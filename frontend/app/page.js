"use client";

import NavBar from "@/components/NavBar/NavBar";
import Map from "@/components/Map/Map";
import ChatPanel from "@/components/ChatPanel/ChatPanel";
import NodeStatus from "@/components/NodeStatus/NodeStatus";

export default function Home() {
  return (
    <main
      style={{
        backgroundColor: "#0d1117",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <NavBar />

      {/* Dashboard grid */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gridTemplateRows: "1fr 260px",
          gap: "12px",
          padding: "12px",
          height: "calc(100vh - 56px)",
          boxSizing: "border-box",
        }}
      >
        {/* Map — spans both rows on the left */}
        <div style={{ gridRow: "1 / 3", borderRadius: "6px", overflow: "hidden" }}>
          <Map />
        </div>

        {/* Node status — top right */}
        <div style={{ gridRow: "1", overflow: "hidden" }}>
          <NodeStatus />
        </div>

        {/* Chat — bottom right */}
        <div style={{ gridRow: "2", overflow: "hidden" }}>
          <ChatPanel />
        </div>
      </div>
    </main>
  );
}
