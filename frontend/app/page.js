"use client";

import NavBar from "@/components/NavBar/NavBar";
import Map from "@/components/Map/Map";
import ChatPanel from "@/components/ChatPanel/ChatPanel";
import NodeStatus from "@/components/NodeStatus/NodeStatus";
import AiChatPanel from "@/components/AiChatPanel/AiChatPanel";

export default function Home() {
  return (
    <main style={{ backgroundColor: "#0d1117", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <NavBar />
      <div style={{ flex: 1, minHeight: 0, display: "flex", padding: "12px", gap: "12px", overflow: "hidden" }}>

        {/* LEFT — 260px, scrollable node panel */}
        <div style={{ width: 260, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <NodeStatus />
        </div>

        {/* CENTRE — flex-1, map + AI chat stacked */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ flex: 1, minHeight: 0, borderRadius: "6px", overflow: "hidden", position: "relative", zIndex: 0 }}>
            <Map />
          </div>
          <AiChatPanel />
        </div>

        {/* RIGHT — 280px, unified comms */}
        <div style={{ width: 280, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <ChatPanel />
        </div>

      </div>
    </main>
  );
}
