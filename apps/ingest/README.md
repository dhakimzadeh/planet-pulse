# ingest

Placeholder for the phase 2 ingest server.

It polls and subscribes to every public feed (USGS, GOES GLM, FIRMS, NOAA space weather, CelesTrak, aisstream) and normalizes them into one `PulseEvent` stream (see `packages/events`).

It needs long-lived processes (GLM files every ~20 s, a persistent aisstream websocket), so it runs on the homelab or a small VPS, not on Vercel. Flights do not go through it: clients fetch adsb.lol directly to stay within its per-IP rate limit.
