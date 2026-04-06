"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { palette } from "@leafygreen-ui/palette";
import { Body, H3 } from "@leafygreen-ui/typography";
import { useFilePanel } from "./useFilePanel";

function formatTime(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString([], {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return "—"; }
}

function formatSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Chevron({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke={palette.gray.base} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s ease", flexShrink: 0 }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CameraIcon({ size = 52 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "6px", backgroundColor: palette.gray.dark1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill="none"
        stroke={palette.gray.base} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </div>
  );
}

function PhotoThumb({ fileId, size = 52, style: extraStyle = {} }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <CameraIcon size={size} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/files/${fileId}/thumb`}
      alt="photo"
      style={{ width: size, height: size, objectFit: "cover", borderRadius: "6px", flexShrink: 0, display: "block", ...extraStyle }}
      onError={() => setFailed(true)}
    />
  );
}

function DetailRow({ label, value, muted = false }) {
  if (value == null) return null;
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
      <span style={{ color: palette.gray.dark1, fontSize: "11px", fontFamily: "monospace", minWidth: "68px", flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span style={{ color: muted ? palette.gray.dark1 : palette.gray.light2, fontSize: "11px", fontFamily: "monospace", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}

function FileDetailModal({ file, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete(file._id);
      onClose();
    } catch {
      setDeleting(false);
    }
  }

  const coord = (file.j != null && file.l != null)
    ? `${file.j.toFixed(5)}, ${file.l.toFixed(5)}`
    : null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: palette.gray.dark3,
          border: `1px solid ${palette.gray.dark2}`,
          borderRadius: "8px",
          width: "340px",
          maxWidth: "90vw",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${palette.gray.dark2}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ color: palette.white, fontSize: "13px", fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.05em" }}>
            {file.e || "PHOTO"}
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: palette.gray.base, padding: "2px", display: "flex", alignItems: "center", lineHeight: 1 }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Image */}
        <div style={{ backgroundColor: "#0d1117", display: "flex", justifyContent: "center", alignItems: "center", padding: "16px" }}>
          <PhotoThumb
            fileId={file._id}
            size={260}
            style={{ borderRadius: "6px", maxWidth: "100%", height: "auto" }}
          />
        </div>

        {/* Details */}
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderTop: `1px solid ${palette.gray.dark2}` }}>
          <DetailRow label="Callsign" value={file.e} />
          <DetailRow label="File" value={file.c} />
          <DetailRow label="Time" value={formatTime(file.b)} />
          <DetailRow label="Size" value={formatSize(file.sz)} />
          <DetailRow label="Location" value={coord ?? "marker removed"} muted={!coord} />
        </div>

        {/* Actions */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${palette.gray.dark2}`, display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            onClick={onClose}
            disabled={deleting}
            style={{
              background: "none", border: `1px solid ${palette.gray.dark2}`, borderRadius: "4px",
              color: palette.gray.light1, fontSize: "12px", fontFamily: "monospace",
              padding: "5px 14px", cursor: "pointer",
            }}
          >
            Close
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              background: "none", border: `1px solid ${palette.red.dark2}`, borderRadius: "4px",
              color: palette.red.base, fontSize: "12px", fontFamily: "monospace",
              padding: "5px 14px", cursor: deleting ? "default" : "pointer",
              opacity: deleting ? 0.5 : 1,
            }}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function FileCard({ file, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "10px", padding: "8px",
        borderRadius: "6px", backgroundColor: palette.gray.dark2,
        cursor: "pointer", transition: "background-color 0.1s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = palette.gray.dark1}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = palette.gray.dark2}
    >
      <PhotoThumb fileId={file._id} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: palette.white, fontWeight: 600, fontSize: "12px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.e || "—"}
        </div>
        <div style={{ color: palette.gray.base, fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>
          {formatTime(file.b)}
        </div>
        {file.j == null && (
          <div style={{ color: palette.gray.dark1, fontSize: "10px", fontFamily: "monospace", marginTop: "2px" }}>
            marker removed
          </div>
        )}
      </div>
    </div>
  );
}

export default function FilePanel({ collapsed, onToggle }) {
  const { files, loading, deleteFile } = useFilePanel();
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ backgroundColor: palette.gray.dark3, border: `1px solid ${palette.gray.dark2}`, borderRadius: "6px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div
        onClick={onToggle}
        style={{ padding: "10px 16px", borderBottom: collapsed ? "none" : `1px solid ${palette.gray.dark2}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <H3 style={{ color: palette.white, margin: 0, fontSize: "14px" }}>SHARED FILES</H3>
          {files.length > 0 && (
            <span style={{ backgroundColor: palette.gray.dark2, color: palette.gray.light1, fontSize: "11px", fontFamily: "monospace", borderRadius: "10px", padding: "1px 7px", lineHeight: "1.6" }}>
              {files.length}
            </span>
          )}
        </div>
        <Chevron open={!collapsed} />
      </div>

      {!collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {loading && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>Loading…</Body>}
          {!loading && files.length === 0 && <Body style={{ color: palette.gray.base, fontSize: "13px" }}>No shared files.</Body>}
          {files.map((file) => (
            <FileCard key={file._id} file={file} onClick={() => setSelected(file)} />
          ))}
        </div>
      )}

      {selected && (
        <FileDetailModal
          file={selected}
          onClose={() => setSelected(null)}
          onDelete={deleteFile}
        />
      )}
    </div>
  );
}
