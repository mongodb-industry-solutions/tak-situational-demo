import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Liveness passthrough. The backend owns /api/health; the browser reaches it
// only through this same-origin proxy (the backend has no public ingress), so
// expose it here too. Cheap and uncached — it is the smoke-test probe target.
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Backend unhealthy" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 500 });
  }
}
