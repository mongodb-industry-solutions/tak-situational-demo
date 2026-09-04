import { NextResponse } from "next/server";

// Server-side lifecycle for Genymotion devices. Two providers:
//   - "saas"  Genymotion Cloud disposable instances (api.geny.io) — the original path.
//   - "paas"  Self-hosted Genymotion PaaS EC2 instances — always-on, one instance per
//            device label (alpha/bravo/...), no start/stop lifecycle.
// Whatever secrets exist (API token, PaaS instance token) stay server-side; the browser
// only ever receives an instance/device id, a state, and (once ONLINE) the WebRTC
// signalling address + player token.
//
//   POST   /api/genymotion/device            → start (SaaS) / resolve (PaaS) a device
//   GET    /api/genymotion/device?instance=  → state; when ONLINE also { webrtcAddress, token }
//   DELETE /api/genymotion/device?instance=  → stop (SaaS destroys it; PaaS is a no-op — the
//                                              box stays up, only the player disconnects)
const PROVIDER = (process.env.GENYMOTION_PROVIDER || "saas").toLowerCase();

const API_BASE = process.env.GENYMOTION_API_BASE || "https://api.geny.io/cloud/v1";
const API_TOKEN = process.env.GENYMOTION_API_TOKEN;
const RECIPE_UUID = process.env.GENYMOTION_RECIPE_UUID;

// PaaS device registry — one long-running EC2 instance per label. The WebSocket
// signalling endpoint on these boxes is NOT behind the console's Basic Auth (verified
// 2026-09-04: a bare WS upgrade to wss://<host>/ with zero credentials returns a clean
// 101 Switching Protocols). Auth is the in-band `{type:"token", token}` message the
// player sends after connecting, and the value the console itself uses for that token
// is simply the EC2 instance id — so that's what we hand the browser too.
const PAAS_DEVICES = {
  alpha: {
    host: process.env.GENYMOTION_PAAS_HOST_ALPHA,
    token: process.env.GENYMOTION_PAAS_TOKEN_ALPHA,
  },
  bravo: {
    host: process.env.GENYMOTION_PAAS_HOST_BRAVO,
    token: process.env.GENYMOTION_PAAS_TOKEN_BRAVO,
  },
};

const authHeaders = () => ({ "x-api-token": API_TOKEN, "Content-Type": "application/json" });
const fail = (error, status, extra = {}) => NextResponse.json({ error, ...extra }, { status });

function paasDevice(label) {
  return PAAS_DEVICES[(label || "").toLowerCase()] || null;
}

export async function POST(request) {
  let name = "atak-device";
  let recipe = null;
  try {
    const body = await request.json();
    if (body?.name) name = body.name;
    if (body?.recipe) recipe = body.recipe;
  } catch {
    /* no body is fine */
  }

  if (PROVIDER === "paas") {
    // GenymotionEmulator posts `name: atak-${label}` — label is the device key (alpha/bravo).
    const label = name.replace(/^atak-/, "");
    const device = paasDevice(label);
    if (!device?.host || !device?.token) {
      return fail(
        `no PaaS device configured for "${label}" — set GENYMOTION_PAAS_HOST_${label.toUpperCase()} / GENYMOTION_PAAS_TOKEN_${label.toUpperCase()}`,
        500
      );
    }
    // Always-on box: no boot to wait for. The label doubles as the "instance id" the
    // browser polls with next.
    return NextResponse.json({ instanceUuid: label, state: "ONLINE" });
  }

  if (!API_TOKEN) return fail("GENYMOTION_API_TOKEN not set", 500);
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
  const instance = new URL(request.url).searchParams.get("instance");
  if (!instance) return fail("instance query param required", 400);

  if (PROVIDER === "paas") {
    // For PaaS, `instance` is the device label returned by POST above.
    const device = paasDevice(instance);
    if (!device?.host || !device?.token) {
      return fail(`no PaaS device configured for "${instance}"`, 500);
    }
    return NextResponse.json({
      state: "ONLINE",
      webrtcAddress: `wss://${device.host}`,
      token: device.token,
    });
  }

  if (!API_TOKEN) return fail("GENYMOTION_API_TOKEN not set", 500);

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
  const instance = new URL(request.url).searchParams.get("instance");
  if (!instance) return fail("instance query param required", 400);

  if (PROVIDER === "paas") {
    // Always-on box — never tear it down from the dashboard. The player-side
    // disconnect already happened client-side; just acknowledge.
    return NextResponse.json({ ok: true, state: "STOPPED" });
  }

  if (!API_TOKEN) return fail("GENYMOTION_API_TOKEN not set", 500);

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
