"use client";

import { useState } from "react";
import Modal from "@leafygreen-ui/modal";
import { H3, Body } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import Button from "@leafygreen-ui/button";
import { palette } from "@leafygreen-ui/palette";

export default function JoinMeshModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        style={{ margin: "5px" }}
        onClick={() => setOpen((prev) => !prev)}
        leftGlyph={<Icon glyph="PlusWithCircle" />}
      >
        Add Device
      </Button>

      <Modal open={open} setOpen={setOpen} size="default">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "8px 0" }}>
          <H3>Join This Mesh</H3>
          <Body style={{ color: palette.gray.dark1, textAlign: "center" }}>
            Scan with ATAK CIV (Ditto Edge Sync plugin) to connect to this network.
          </Body>
          <div style={{ background: palette.white, padding: "16px", borderRadius: "8px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/atak-ditto-conf.png"
              alt="Ditto mesh join QR code"
              style={{ width: 280, height: 280, display: "block" }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
