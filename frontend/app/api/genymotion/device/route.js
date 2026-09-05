import { NextResponse } from "next/server";

// Thin proxy to the FastAPI backend, which owns the Genymotion PaaS device registry
// and secrets (see backend/routers/genymotion.py). Never call the backend directly
// from client components.
//
//   POST   /api/genymotion/device          → resolve a device by { label }
//   GET    /api/genymotion/device?label=   → state; when ONLINE also { webrtcAddress, token }
//   DELETE /api/genymotion/device?label=   → disconnect (EC2 stays up — see backend router)
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const fail = (error, status = 500) => NextResponse.json({ error }, { status });

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* no body is fine */
  }
  try {
    const res = await fetch(`${BACKEND_URL}/api/genymotion/device`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data?.detail || "start failed", res.status);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Genymotion start error:", error);
    return fail(String(error));
  }
}

export async function GET(request) {
  const label = new URL(request.url).searchParams.get("label");
  if (!label) return fail("label query param required", 400);
  try {
    const res = await fetch(`${BACKEND_URL}/api/genymotion/device?label=${encodeURIComponent(label)}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data?.detail || "state lookup failed", res.status);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Genymotion state error:", error);
    return fail(String(error));
  }
}

export async function DELETE(request) {
  const label = new URL(request.url).searchParams.get("label");
  if (!label) return fail("label query param required", 400);
  try {
    const res = await fetch(`${BACKEND_URL}/api/genymotion/device?label=${encodeURIComponent(label)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data?.detail || "stop failed", res.status);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Genymotion stop error:", error);
    return fail(String(error));
  }
}
