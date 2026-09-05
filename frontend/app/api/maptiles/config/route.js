import { NextResponse } from "next/server";

// Server-only — CARTO_API_KEY has no NEXT_PUBLIC_ prefix, so it's never inlined into
// the client bundle at build time. The browser gets it only via this runtime call,
// letting it be managed the same way as every other secret (envSecrets/Kanopy),
// with no Docker build-arg / CI plumbing needed.
export async function GET() {
  const key = process.env.CARTO_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "CARTO_API_KEY not set" }, { status: 500 });
  }
  return NextResponse.json({ key });
}
