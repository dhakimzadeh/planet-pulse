# Planet Pulse

A live, slowly rotating globe of the planet's activity, built as ambient art.

**Phase 1 — Make it beautiful:** WebGL globe with live USGS earthquakes and adsb.lol flights, event cinema, a real day/night line and a first pass at generative sound.
Gate: you leave it running for a day and still want it on.

- **Event cinema:** a live quake at or above M5 dives the camera in, shows a caption, then drifts back to orbit. On load it also plays the day's largest quake (if M4.5+) once the intro replay finishes.
- **Living light:** a dimmed Blue Marble day side, city lights on the night side, a soft twilight band; recomposited in a worker every 2 minutes.
- **Sound:** off by default (browsers need a click). Quakes are sub-bass hits (small ones are pentatonic bells pitched by latitude), panned by longitude; flight density drives a slow pad.

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

URL params: `?lat=32.9&lon=-117.1` sets the starting view (flights are fetched around the view center); `?cinema=4.5` lowers the dive threshold.

Keys: `S` toggles sound, `C` replays the day's largest quake. Dragging the globe cancels a dive. The cursor and sound button hide after 4 s without mouse movement.

## Data and attribution

| Layer | Source | Notes |
| --- | --- | --- |
| Earthquakes | USGS all_day GeoJSON | Public domain, polled every 60 s |
| Flights | adsb.lol `/v2/point` | ODbL, attribution required; 250 nmi circle max; fetched from the browser to respect per-IP limits; contact them before production use |
| Base imagery | NASA GIBS `BlueMarble_ShadedRelief_Bathymetry` + `VIIRS_CityLights_2012` | Public |

Not for safety use.

## Deploy

Vercel project root directory is `apps/web` with the Vite preset (npm installs the workspace from the repo root automatically).
