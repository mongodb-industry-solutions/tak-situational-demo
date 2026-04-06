"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import NavBar from "@/components/NavBar/NavBar";
import Map from "@/components/Map/Map";
import ChatPanel from "@/components/ChatPanel/ChatPanel";
import NodeStatus from "@/components/NodeStatus/NodeStatus";
import AlertPanel from "@/components/AlertPanel/AlertPanel";
import FilePanel from "@/components/FilePanel/FilePanel";

const HEADER_H = 42;
const MIN_GROW = 0.15;

export default function Home() {
  const [rightWidth, setRightWidth] = useState(320);
  const [collapsed, setCollapsed] = useState({ nodes: false, alerts: false, chat: false, files: false });
  // flex-grow for each section: [nodes, alerts, chat, files]
  const [grows, setGrows] = useState([1.2, 0.8, 1.5, 1.0]);

  const colDrag = useRef(null);   // horizontal column resize
  const secDrag = useRef(null);   // vertical section resize
  const rightColRef = useRef(null);

  const toggle = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const startColDrag = useCallback((e) => {
    e.preventDefault();
    colDrag.current = { x: e.clientX, w: rightWidth };
  }, [rightWidth]);

  const startSecDrag = useCallback((e, topIdx) => {
    e.preventDefault();
    e.stopPropagation();
    secDrag.current = { y: e.clientY, topIdx, bottomIdx: topIdx + 1, topGrow: grows[topIdx], bottomGrow: grows[topIdx + 1] };
  }, [grows]);

  useEffect(() => {
    const onMove = (e) => {
      if (colDrag.current) {
        const delta = colDrag.current.x - e.clientX;
        setRightWidth(Math.max(240, Math.min(600, colDrag.current.w + delta)));
      }
      if (secDrag.current) {
        const { y, topIdx, bottomIdx, topGrow, bottomGrow } = secDrag.current;
        const deltaY = e.clientY - y;
        const colHeight = rightColRef.current?.offsetHeight || 600;
        const totalGrow = topGrow + bottomGrow;
        const flexDelta = (deltaY / colHeight) * totalGrow;
        const newTop = Math.max(MIN_GROW, topGrow + flexDelta);
        const newBottom = Math.max(MIN_GROW, bottomGrow - flexDelta);
        secDrag.current = { ...secDrag.current, y: e.clientY, topGrow: newTop, bottomGrow: newBottom };
        setGrows((g) => {
          const next = [...g];
          next[topIdx] = newTop;
          next[bottomIdx] = newBottom;
          return next;
        });
      }
    };
    const onUp = () => { colDrag.current = null; secDrag.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const sections = [
    { key: "nodes",  Comp: NodeStatus,  grow: grows[0] },
    { key: "alerts", Comp: AlertPanel,  grow: grows[1] },
    { key: "chat",   Comp: ChatPanel,   grow: grows[2] },
    { key: "files",  Comp: FilePanel,   grow: grows[3] },
  ];

  return (
    <main style={{ backgroundColor: "#0d1117", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <NavBar />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "row", padding: "12px", overflow: "hidden" }}>

        {/* Map */}
        <div style={{ flex: 1, minWidth: 0, borderRadius: "6px", overflow: "hidden", position: "relative", zIndex: 0 }}>
          <Map />
        </div>

        {/* Column resize handle */}
        <div
          onMouseDown={startColDrag}
          style={{ width: "12px", flexShrink: 0, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <div style={{ width: "3px", height: "48px", borderRadius: "2px", background: "#2d3748" }} />
        </div>

        {/* Right column */}
        <div
          ref={rightColRef}
          style={{ width: `${rightWidth}px`, flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
        >
          {sections.map(({ key, Comp, grow }, i) => (
            <div key={key} style={{ display: "contents" }}>
              {/* Section */}
              <div style={{
                flex: collapsed[key] ? `0 0 ${HEADER_H}px` : `${grow} 1 0`,
                minHeight: `${HEADER_H}px`,
                overflow: "hidden",
              }}>
                <Comp collapsed={collapsed[key]} onToggle={() => toggle(key)} />
              </div>

              {/* Section resize handle — between this and the next section */}
              {i < sections.length - 1 && (
                <div
                  onMouseDown={(e) => startSecDrag(e, i)}
                  style={{
                    height: "8px",
                    flexShrink: 0,
                    cursor: (!collapsed[key] && !collapsed[sections[i + 1].key]) ? "row-resize" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: (!collapsed[key] && !collapsed[sections[i + 1].key]) ? "auto" : "none",
                  }}
                >
                  <div style={{ width: "40px", height: "2px", borderRadius: "1px", background: "#2d3748" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
