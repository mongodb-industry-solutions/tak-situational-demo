const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request, { params }) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${encodeURIComponent(id)}/thumb`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return new Response(null, { status: res.status });
    }
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      headers: { "Content-Type": res.headers.get("Content-Type") || "image/jpeg" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
