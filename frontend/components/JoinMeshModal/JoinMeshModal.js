"use client";

import { useEffect, useState } from "react";
import Modal from "@leafygreen-ui/modal";
import { H3, Body } from "@leafygreen-ui/typography";
import Icon from "@leafygreen-ui/icon";
import Button from "@leafygreen-ui/button";
import { palette } from "@leafygreen-ui/palette";

// One row of the "type it in by hand" fallback table.
function Field({ label, value }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (non-secure context) — the value is visible anyway */
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "monospace", fontSize: 11 }}>
      <span style={{ color: palette.gray.dark1, width: 110, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: palette.black,
          background: palette.gray.light2,
          padding: "2px 6px",
          borderRadius: 3,
          flex: 1,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
      <button
        onClick={copy}
        style={{
          background: "none",
          border: `1px solid ${palette.gray.light1}`,
          borderRadius: 3,
          color: copied ? palette.green.dark1 : palette.gray.dark1,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 10,
          padding: "2px 6px",
          flexShrink: 0,
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

export default function JoinMeshModal() {
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState(null);

  // Fetch once the modal is actually opened — no reason to pull pairing
  // material on every dashboard load.
  useEffect(() => {
    if (!open || identity !== null) return;
    let cancelled = false;
    fetch("/api/ditto/identity")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setIdentity(data);
      })
      .catch(() => {
        if (!cancelled) setIdentity({ available: false });
      });
    return () => {
      cancelled = true;
    };
  }, [open, identity]);

  const selfHosted = identity?.available === true;

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
              src="/api/ditto/qr"
              alt="Ditto mesh join QR code"
              style={{ width: 280, height: 280, display: "block" }}
            />
          </div>

          {/* Self-hosted Big Peer: also show the raw values.
              The payload format the ATAK plugin expects from a QR has not been
              verified against a physical device, so entering these four values
              in the plugin's settings is the dependable route. */}
          {selfHosted && (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
              <Body weight="medium" style={{ color: palette.gray.dark2, fontSize: 12 }}>
                Or enter these in the plugin settings:
              </Body>
              <Field label="App ID" value={identity.appId} />
              <Field label="Auth URL" value={identity.authUrl} />
              <Field label="Websocket" value={identity.websocketUrl} />
              <Field label="Token" value={identity.playgroundToken} />
              <Body style={{ color: palette.gray.dark1, fontSize: 11, marginTop: 4 }}>
                Disable “sync to Ditto Cloud” in the plugin, and make sure the device
                is on the same Wi-Fi as this machine.
              </Body>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
