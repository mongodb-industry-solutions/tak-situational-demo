import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Whether the AI panel has a usable LLM backend, and whether it is ready yet.
//
// "configured" and "ready" differ on the local stack: Ollama is deployed during
// setup but its model is pulled in the background, so the panel can be enabled
// while still warming up. The panel surfaces that instead of just failing.
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/systemai/status`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`backend returned ${res.status}`);
    return NextResponse.json(await res.json());
  } catch (error) {
    console.warn("[systemai] status unavailable:", error.message);
    return NextResponse.json({ enabled: false, ready: false });
  }
}
