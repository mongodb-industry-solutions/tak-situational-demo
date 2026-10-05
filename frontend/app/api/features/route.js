import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Which optional capabilities this deployment actually has. The same image runs
// locally (self-hosted MongoDB EA + Ditto Big Peer, Ollama) and on Kanopy (Atlas
// + Ditto Cloud + the internal LLM gateway), with different pieces configured —
// so the UI asks the backend rather than assuming.
//
// Read at request time (not build time) so no NEXT_PUBLIC_* is needed.
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/features`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`backend returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (error) {
    console.warn("[features] falling back to defaults:", error.message);
    // Fail closed: hide optional UI rather than render buttons that 503.
    return NextResponse.json({ simulate: false, joinMesh: false });
  }
}
