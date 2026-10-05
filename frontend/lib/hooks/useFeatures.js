"use client";

import { useEffect, useState } from "react";

// Capability detection for optional UI.
//
// The same build runs against two very different backends: the local
// self-hosted stack (MongoDB EA + Ditto Big Peer + Ollama) and the internal
// Kanopy deployment (Atlas + Ditto Cloud + MongoDB's LLM gateway). Rather than
// branching on NEXT_PUBLIC_* at build time, the backend reports what it has and
// the UI hides what isn't there.
//
// `null` means "not determined yet" so callers can avoid flashing UI that is
// about to be hidden. Fails closed on error.
export function useFeatures() {
  const [features, setFeatures] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/features")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setFeatures(data);
      })
      .catch(() => {
        if (!cancelled) setFeatures({ simulate: false, joinMesh: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
