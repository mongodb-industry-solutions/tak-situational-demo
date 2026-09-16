import { NextResponse } from "next/server";

// CARTO_API_KEY has no NEXT_PUBLIC_ prefix, so it's not baked into the client bundle
// at build time — the browser gets it only at runtime via this call, so it's injectable
// from Kanopy env and rotatable without rebuilding. Note: CARTO basemap keys are meant
// to be client-visible (free tier, domain/attribution-scoped); this endpoint is about
// keeping them out of the build + reading from env, not protecting a true secret — any
// browser that loads the map can see the returned key.
export async function GET() {
  const key = process.env.CARTO_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "CARTO_API_KEY not set" }, { status: 500 });
  }
  return NextResponse.json({ key });
}
