"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import InfoWizard from "@/components/infoWizard/InfoWizard";
import JoinMeshModal from "@/components/JoinMeshModal/JoinMeshModal";
import { palette } from "@leafygreen-ui/palette";

export default function NavBar() {
  const pathname = usePathname();
  const onSimulate = pathname === "/simulate";

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
        <Image src="/mongo.png" alt="MongoDB" height={28} width={13} />
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

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Link
          href={onSimulate ? "/" : "/simulate"}
          style={{
            backgroundColor: onSimulate ? palette.gray.dark2 : "#166534",
            border: `1px solid ${onSimulate ? palette.gray.dark1 : "#22c55e"}`,
            borderRadius: 6,
            color: palette.white,
            fontFamily: "monospace",
            fontSize: "12px",
            fontWeight: 700,
            padding: "6px 12px",
            textDecoration: "none",
            letterSpacing: "0.04em",
          }}
        >
          {onSimulate ? "← Command Center" : "▶ Simulate"}
        </Link>
        <JoinMeshModal />
        <InfoWizard tooltipText="About this demo" iconGlyph="Wizard" />
      </div>
    </nav>
  );
}
