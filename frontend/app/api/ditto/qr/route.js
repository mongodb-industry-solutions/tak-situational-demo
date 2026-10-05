const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// The QR is never cacheable. On a self-hosted run it embeds the Big Peer host,
// which is derived from this machine's LAN IP and changes between networks and
// setup runs; a cached image would pair devices against a stale address. The
// backend already sends `Cache-Control: no-store`, but this proxy builds a new
// Response, so the header has to be set here explicitly.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ditto/qr`, { cache: "no-store" });
    if (!res.ok) {
      return new Response(null, { status: res.status, headers: NO_STORE });
    }
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/png",
        ...NO_STORE,
      },
    });
  } catch {
    return new Response(null, { status: 502, headers: NO_STORE });
  }
}
