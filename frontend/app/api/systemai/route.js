import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/systemai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Forward FastAPI's `detail` so the panel can show an actionable reason
      // ("No LLM backend configured", "model is still downloading", the agent
      // error) instead of a generic failure. useAiChatPanel reads `detail`.
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: "AI request failed", detail: err?.detail ?? null },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("System AI error:", error);
    return NextResponse.json(
      { error: "AI request failed", detail: "the dashboard could not reach the backend" },
      { status: 502 }
    );
  }
}
