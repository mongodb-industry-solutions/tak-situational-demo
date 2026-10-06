import { NextResponse } from "next/server";

// CARTO_API_KEY has no NEXT_PUBLIC_ prefix, so it's not baked into the client
// bundle at build time — the browser gets it only at runtime via this call, so
// it's injectable from Kanopy env and rotatable without rebuilding. Note: CARTO
// basemap keys are meant to be client-visible (free tier, domain/attribution
// scoped); this endpoint is about keeping them out of the build + reading from
// env, not protecting a true secret — any browser that loads the map can see
// the returned key.
//
// A missing key is NOT an error: the local self-hosted stack has no CARTO
// account, and MapInner falls back to OpenStreetMap tiles. So return 200 with
// key:null instead of a 500, which previously logged a scary console warning
// on every load of a perfectly healthy local deployment.
export async function GET() {
  const key = process.env.CARTO_API_KEY?.trim();
  return NextResponse.json({ key: key || null });
}
