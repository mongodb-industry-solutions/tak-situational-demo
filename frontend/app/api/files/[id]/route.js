const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function DELETE(request, { params }) {
  const { id } = await params;
  try {
    const res = await fetch(`${BACKEND_URL}/api/files/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Failed to delete file" }), { status: res.status });
    }
    const data = await res.json();
    return new Response(JSON.stringify(data), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to delete file" }), { status: 502 });
  }
}
