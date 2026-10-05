import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

// Big Peer connection details for pairing an ATAK device, as JSON.
//
// Only populated when running against a SELF-HOSTED Big Peer; the cloud
// deployment returns 404 here and the modal falls back to showing just the QR
// image. We expose the plain values because the exact payload the ATAK Ditto
// plugin expects from a scanned QR is not yet verified — being able to type the
// four values into the plugin by hand is the reliable path.
export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/ditto/identity`, {
      cache: "no-store",
    });
    if (!res.ok) {
      // 404 is the normal "cloud deployment" answer, not an error.
      return NextResponse.json({ available: false }, { status: 200 });
    }
    const data = await res.json();
    return NextResponse.json({ available: true, ...data });
  } catch (error) {
    console.warn("[ditto] identity unavailable:", error.message);
    return NextResponse.json({ available: false }, { status: 200 });
  }
}
