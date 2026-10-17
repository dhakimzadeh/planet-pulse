# Planet Pulse

A live, slowly rotating globe of the planet's activity, built as ambient art.

**Phase 1 prototype:** web globe with live USGS earthquakes and adsb.lol flights, pulse effects, one mode.
Gate: it looks good enough to leave running for an hour.

## Layout

| Path | What |
| --- | --- |
| `apps/web` | Vite + TypeScript + deck.gl globe; the shared renderer later wrapped per platform |
| `apps/ingest` | Phase 2 ingest server (runs on the homelab, not Vercel) |
| `packages/events` | The shared `PulseEvent` format: type, position, time, magnitude |

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build
```

URL params: `?lat=32.9&lon=-117.1` sets the starting view (flights are fetched around the view center).

## Data and attribution

| Layer | Source | Notes |
| --- | --- | --- |
| Earthquakes | USGS all_day GeoJSON | Public domain, polled every 60 s |
| Flights | adsb.lol `/v2/point` | ODbL, attribution required; 250 nmi circle max; fetched from the browser to respect per-IP limits; contact them before production use |
| Base imagery | NASA GIBS `VIIRS_CityLights_2012` | Public |

Not for safety use.

## Deploy

Vercel project root directory is `apps/web` with the Vite preset (npm installs the workspace from the repo root automatically).
