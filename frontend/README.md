# Frontend — command vehicle dashboard

Next.js 15 (App Router, JavaScript — no TypeScript) + LeafyGreen UI + Tailwind 4,
with Leaflet for the map.

> Most of the time you do **not** run this directly. `make setup` from the repo
> root builds it into the local kind cluster and serves it at
> <http://localhost>. See [`../docs/RUN_LOCAL.md`](../docs/RUN_LOCAL.md).

## Running on its own

Needs the backend reachable on `BACKEND_URL` (default `http://localhost:8000`).

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script          | What it does                                       |
| --------------- | -------------------------------------------------- |
| `npm run dev`   | Dev server on :3000                                |
| `npm run build` | Production build                                   |
| `npm start`     | Serve the build on :8080 (what the container runs) |
| `npm run lint`  | ESLint                                             |

## Environment

No `NEXT_PUBLIC_*` variables — deliberately. Every value is read at **request
time** inside a Route Handler, so one image works in every environment and keys
are never baked into the client bundle.

| Variable          | Default                 | Purpose                                                                                                |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `BACKEND_URL`     | `http://localhost:8000` | FastAPI base URL for the `/api/*` proxy routes                                                         |
| `CARTO_API_KEY`   | _(unset)_               | CARTO dark basemap. Falls back to OpenStreetMap tiles when unset.                                      |
| `ENABLE_SIMULATE` | `false`                 | Shows the paused Genymotion "Simulate" view. Read by the **backend** and surfaced via `/api/features`. |

`cp .env.example .env.local` if you want to set `CARTO_API_KEY` locally.

## Conventions

- **Components**: `components/<Name>/<Name>.js` (JSX) + `use<Name>.js` (hook with
  the data/state logic).
- **API access**: client components never call the backend directly — they call
  `app/api/<resource>/route.js`, which proxies to `BACKEND_URL`. That keeps the
  browser same-origin and keeps server-only config server-side.
- **Polling**: `usePolling(fetchFn, intervalMs)` from `lib/hooks/usePolling.js`
  (2 s default).
- **Capability flags**: `useFeatures()` from `lib/hooks/useFeatures.js` reads
  `/api/features`. Use it to hide UI whose backing service isn't configured,
  rather than branching on build-time env.
- **react-leaflet** must be loaded with `dynamic(..., { ssr: false })` — see
  `components/Map/Map.js`. `reactStrictMode` is off in `next.config.mjs` because
  react-leaflet 4.x double-mounts under it.
- **Colours**: import from `@leafygreen-ui/palette`; style guides live in
  `utils/style/`.

## Layout

```
app/
  page.js              /          command center (node status | map + AI | comms)
  simulate/page.js     /simulate  paused Genymotion view, gated on ENABLE_SIMULATE
  api/                            proxy Route Handlers -> BACKEND_URL
components/
  Map/ NodeStatus/ ChatPanel/ AiChatPanel/ NavBar/ JoinMeshModal/ infoWizard/
  FilePanel/ AlertPanel/ TelemetryPanel/      (hooks reused by the panels above)
  GenymotionEmulator/ GpsControl/             (Simulate view only)
lib/
  hooks/usePolling.js  hooks/useFeatures.js  filterByCallsign.js  const/talkTrack.js
```
