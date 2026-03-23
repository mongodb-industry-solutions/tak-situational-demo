"use client";

import InfoWizard from "@/components/infoWizard/InfoWizard";
import { palette } from "@leafygreen-ui/palette";

export default function NavBar() {
  return (
    <nav
      style={{
        backgroundColor: palette.black,
        borderBottom: `1px solid ${palette.gray.dark2}`,
        padding: "0 24px",
        height: "56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {/* MongoDB leaf mark */}
        <img src="/mongo.png" alt="MongoDB" style={{ height: "28px" }} />
        <span
          style={{
            color: palette.white,
            fontFamily: "var(--font-geist-sans, sans-serif)",
            fontWeight: 600,
            fontSize: "16px",
            letterSpacing: "0.02em",
          }}
        >
          TAK Situational Demo
        </span>
        <span
          style={{
            color: palette.gray.base,
            fontFamily: "var(--font-geist-sans, sans-serif)",
            fontWeight: 400,
            fontSize: "13px",
          }}
        >
          Command Vehicle View
        </span>
      </div>

      <InfoWizard tooltipText="About this demo" iconGlyph="Wizard" />
    </nav>
  );
}
