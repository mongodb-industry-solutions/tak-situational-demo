"use client";

import { palette } from "@leafygreen-ui/palette";
import { H3 } from "@leafygreen-ui/typography";
import { useFilePanel } from "./useFilePanel";

function formatTime(ms) {
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function CameraPlaceholder() {
  return (
    <div
      style={{
        width: "48px",
        height: "48px",
        borderRadius: "8px",
        backgroundColor: palette.gray.dark2,
        border: `1px solid ${palette.gray.dark1}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={palette.gray.base} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    </div>
  );
}

function FileCard({ file }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        padding: "8px",
        borderRadius: "6px",
        backgroundColor: palette.gray.dark2,
        border: `1px solid ${palette.gray.dark1}`,
        width: "88px",
        cursor: "default",
      }}
    >
      <CameraPlaceholder />
      <div style={{ textAlign: "center", lineHeight: "1.3" }}>
        <div
          style={{
            color: palette.white,
            fontSize: "11px",
            fontWeight: 600,
            fontFamily: "monospace",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "72px",
          }}
          title={file.e}
        >
          {file.e || "—"}
        </div>
        <div style={{ color: palette.gray.base, fontSize: "10px", fontFamily: "monospace" }}>
          {formatTime(file.b)}
        </div>
      </div>
      {file.j == null && (
        <div
          style={{
            fontSize: "9px",
            color: palette.gray.dark1,
            fontFamily: "monospace",
            textAlign: "center",
          }}
          title="Map marker removed"
        >
          no marker
        </div>
      )}
    </div>
  );
}

export default function FilePanel() {
  const { files, loading } = useFilePanel();

  return (
    <div
      style={{
        backgroundColor: palette.gray.dark3,
        border: `1px solid ${palette.gray.dark2}`,
        borderRadius: "6px",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 16px",
          borderBottom: `1px solid ${palette.gray.dark2}`,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>SHARED FILES</H3>
        {files.length > 0 && (
          <span
            style={{
              backgroundColor: palette.gray.dark2,
              color: palette.gray.light1,
              fontSize: "11px",
              fontFamily: "monospace",
              borderRadius: "10px",
              padding: "1px 7px",
              lineHeight: "1.6",
            }}
          >
            {files.length}
          </span>
        )}
      </div>

      <div
        style={{
          flex: 1,
          overflowX: "auto",
          overflowY: "hidden",
          display: "flex",
          flexDirection: "row",
          gap: "8px",
          padding: "10px 12px",
          alignItems: "flex-start",
        }}
      >
        {loading && (
          <span style={{ color: palette.gray.base, fontSize: "13px", alignSelf: "center" }}>
            Loading…
          </span>
        )}
        {!loading && files.length === 0 && (
          <span style={{ color: palette.gray.base, fontSize: "13px", alignSelf: "center" }}>
            No shared files.
          </span>
        )}
        {files.map((file) => (
          <FileCard key={file._id} file={file} />
        ))}
      </div>
    </div>
  );
}
