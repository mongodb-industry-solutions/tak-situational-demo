const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ditto/qr`, { cache: "no-store" });
    if (!res.ok) {
      return new Response(null, { status: res.status });
    }
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      headers: { "Content-Type": res.headers.get("Content-Type") || "image/png" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
