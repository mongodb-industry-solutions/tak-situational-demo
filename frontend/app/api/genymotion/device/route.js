import { NextResponse } from "next/server";

// Server-side lifecycle for Genymotion SaaS "disposable" instances. The API token is a
// powerful secret and stays here; the browser only ever receives an instance UUID, a
// boot state, and (once ONLINE) a short instance-scoped player token + WebRTC address.
//
//   POST   /api/genymotion/device            → start a disposable instance from the recipe
//   GET    /api/genymotion/device?instance=  → boot state; when ONLINE also { webrtcAddress, token }
//   DELETE /api/genymotion/device?instance=  → stop (auto-destroys the disposable instance)
const API_BASE = process.env.GENYMOTION_API_BASE || "https://api.geny.io/cloud/v1";
const API_TOKEN = process.env.GENYMOTION_API_TOKEN;
const RECIPE_UUID = process.env.GENYMOTION_RECIPE_UUID;

const authHeaders = () => ({ "x-api-token": API_TOKEN, "Content-Type": "application/json" });
const fail = (error, status, extra = {}) => NextResponse.json({ error, ...extra }, { status });

export async function POST(request) {
  if (!API_TOKEN) return fail("GENYMOTION_API_TOKEN not set", 500);

  let name = "atak-device";
  let recipe = null;
  try {
    const body = await request.json();
    if (body?.name) name = body.name;
    if (body?.recipe) recipe = body.recipe;
  } catch {
    /* no body is fine */
  }
  // Per-device recipe: each sim device boots from its own recipe so it gets a unique
  // CoT UID + callsign. Falls back to the single env recipe (used by /genymotion).
  const recipeUuid = recipe || RECIPE_UUID;
  if (!recipeUuid) return fail("no recipe — set GENYMOTION_RECIPE_UUID or pass { recipe }", 500);

  try {
    const res = await fetch(`${API_BASE}/recipes/${recipeUuid}/start-disposable`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ instance_name: name, rename_on_conflict: true, timeouts: {} }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[genymotion] start ${res.status}:`, data);
      return fail("start failed", 502, { status: res.status, data });
    }
    const inst = data?.instance || data;
    return NextResponse.json({
      instanceUuid: inst?.uuid || inst?.instance_uuid || null,
      state: inst?.state ?? "CREATING",
    });
  } catch (error) {
    console.error("Genymotion start error:", error);
    return fail(String(error), 500);
  }
}

export async function GET(request) {
  if (!API_TOKEN) return fail("GENYMOTION_API_TOKEN not set", 500);
  const instance = new URL(request.url).searchParams.get("instance");
  if (!instance) return fail("instance query param required", 400);

  try {
    const res = await fetch(`${API_BASE}/instances/${instance}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail("instance lookup failed", 502, { status: res.status, data });

    const d = data?.instance || data;
    const state = d?.state || "UNKNOWN";
    const out = { state };

    // Once booted, attach the player connection (WebRTC endpoint + minted token).
    if (state === "ONLINE") {
      out.webrtcAddress = d?.webrtc_url || d?.webrtcUrl || d?.secure_address || d?.address || null;
      const tokenRes = await fetch(`${API_BASE}/instances/access-token`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ instance_uuid: instance }),
        cache: "no-store",
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      out.token = tokenData?.access_token || tokenData?.token || null;
    }
    return NextResponse.json(out);
  } catch (error) {
    console.error("Genymotion state error:", error);
    return fail(String(error), 500);
  }
}

export async function DELETE(request) {
  if (!API_TOKEN) return fail("GENYMOTION_API_TOKEN not set", 500);
  const instance = new URL(request.url).searchParams.get("instance");
  if (!instance) return fail("instance query param required", 400);

  try {
    const res = await fetch(`${API_BASE}/instances/${instance}/stop-disposable`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[genymotion] stop ${res.status}:`, data);
      return fail("stop failed", 502, { status: res.status, data });
    }
    return NextResponse.json({ ok: true, state: "STOPPING" });
  } catch (error) {
    console.error("Genymotion stop error:", error);
    return fail(String(error), 500);
  }
}
