import { Deck, _GlobeView as GlobeView, COORDINATE_SYSTEM } from '@deck.gl/core';
import { BitmapLayer, ScatterplotLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { PulseEvent } from '@planet-pulse/events';
import { fetchEarthquakes } from './data/earthquakes';
import { fetchFlights, projectFlight, type Flight } from './data/flights';
import './style.css';

// ---------- tuning ----------
const ROTATION_DEG_PER_SEC = 1.2; // one revolution in ~5 minutes
const RESUME_ROTATION_AFTER_MS = 20_000;
const QUAKE_POLL_MS = 60_000;
const FLIGHT_POLL_MS = 15_000;
const INTRO_WINDOW_MS = 3 * 3600_000; // on load, replay the last 3 h of quakes as pulses
const INTRO_SPREAD_MS = 40_000; // ...spread over the first 40 s

const QUAKE_COLOR: [number, number, number] = [255, 160, 80];
const FLIGHT_COLOR: [number, number, number] = [140, 210, 255];

// NASA GIBS city lights, whole world as one equirectangular image (CORS-enabled).
const BASE_IMAGE =
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
  '&LAYERS=VIIRS_CityLights_2012&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=4096&HEIGHT=2048&FORMAT=image/jpeg';

// ---------- state ----------
const params = new URLSearchParams(location.search);
let viewState = {
  longitude: Number(params.get('lon') ?? -100),
  latitude: Number(params.get('lat') ?? 22),
  zoom: fitZoom(),
};
let lastInteraction = -Infinity;
let interacting = false;

let quakes: PulseEvent[] = [];
const seenQuakes = new Set<string>();
interface Pulse {
  position: [number, number];
  magnitude: number;
  start: number;
}
let pulses: Pulse[] = [];

let flights: Flight[] = [];
let flightCenter: [number, number] | null = null;
let quakeStatus = 'loading…';
let flightStatus = 'loading…';

function fitZoom() {
  // Fill ~80% of the shorter screen side with the globe.
  return Math.log2((Math.min(innerWidth, innerHeight) * 0.8) / 512) + 0.1;
}

// ---------- deck ----------
const deck = new Deck({
  parent: document.getElementById('globe') as HTMLDivElement,
  views: new GlobeView({ id: 'globe', resolution: 5 }),
  viewState,
  controller: { inertia: 1000 },
  onViewStateChange: ({ viewState: vs }) => {
    viewState = vs as typeof viewState;
    lastInteraction = performance.now();
    return vs;
  },
  onInteractionStateChange: (s) => {
    interacting = Boolean(s.isDragging || s.isZooming || s.isPanning || s.isRotating);
    lastInteraction = performance.now();
  },
  parameters: { clearColor: [3 / 255, 5 / 255, 9 / 255, 1] } as never,
  layers: [],
});

addEventListener('resize', () => {
  viewState = { ...viewState, zoom: fitZoom() };
});

// ---------- data loops ----------
async function pollQuakes(first = false) {
  try {
    const list = await fetchEarthquakes();
    const now = Date.now();
    const fresh = list.filter((q) => !seenQuakes.has(q.id));
    fresh.forEach((q) => seenQuakes.add(q.id));
    quakes = list;

    if (first) {
      // Intro: replay recent quakes in time order so the globe wakes up.
      const recent = fresh.filter((q) => now - q.time < INTRO_WINDOW_MS).sort((a, b) => a.time - b.time);
      recent.forEach((q, i) => {
        pulses.push({
          position: q.position as [number, number],
          magnitude: q.magnitude,
          start: now + 1500 + (i / Math.max(1, recent.length)) * INTRO_SPREAD_MS,
        });
      });
    } else {
      fresh.forEach((q) => pulses.push({ position: q.position as [number, number], magnitude: q.magnitude, start: now }));
    }
    quakeStatus = '';
  } catch (e) {
    quakeStatus = `quakes unavailable (${(e as Error).message})`;
  }
}

async function pollFlights() {
  const center: [number, number] = [viewState.longitude, viewState.latitude];
  try {
    flights = await fetchFlights(center[1], center[0]);
    flightCenter = center;
    flightStatus = '';
  } catch (e) {
    // A TypeError here usually means the browser blocked the request (CORS / network).
    const err = e as Error;
    flightStatus = `flights unavailable (${err.name === 'TypeError' ? 'blocked or offline' : err.message})`;
  }
}

pollQuakes(true);
pollFlights();
setInterval(pollQuakes, QUAKE_POLL_MS);
setInterval(pollFlights, FLIGHT_POLL_MS);

// ---------- render loop ----------
function pulseDuration(mag: number) {
  return 3500 + Math.max(0, mag) * 700;
}
function pulseMaxRadius(mag: number) {
  return 40_000 * Math.pow(1.8, Math.max(0.5, mag)); // meters
}

let lastFrame = performance.now();
function frame(t: number) {
  const dt = (t - lastFrame) / 1000;
  lastFrame = t;
  const now = Date.now();

  if (!interacting && t - lastInteraction > RESUME_ROTATION_AFTER_MS) {
    viewState = { ...viewState, longitude: ((viewState.longitude + ROTATION_DEG_PER_SEC * dt + 540) % 360) - 180 };
  }

  pulses = pulses.filter((p) => now - p.start < pulseDuration(p.magnitude));
  const activePulses = pulses.filter((p) => now >= p.start);

  const layers = [
    new SolidPolygonLayer({
      id: 'ocean',
      data: [[[-180, 90], [0, 90], [180, 90], [180, -90], [0, -90], [-180, -90]]],
      getPolygon: (d) => d,
      getFillColor: [6, 10, 20],
    }),
    new BitmapLayer({
      id: 'base',
      image: BASE_IMAGE,
      bounds: [-180, -90, 180, 90],
      _imageCoordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      tintColor: [150, 170, 210],
      opacity: 0.9,
    }),
    new ScatterplotLayer<PulseEvent>({
      id: 'quake-dots',
      data: quakes,
      getPosition: (d) => d.position,
      radiusUnits: 'pixels',
      getRadius: (d) => 1.2 + Math.max(0, d.magnitude) * 0.9,
      getFillColor: (d) => {
        const ageH = (now - d.time) / 3600_000;
        return [...QUAKE_COLOR, Math.max(35, 210 - ageH * 7)] as [number, number, number, number];
      },
      updateTriggers: { getFillColor: Math.floor(now / 60_000) },
    }),
    new ScatterplotLayer<Pulse>({
      id: 'quake-pulses',
      data: activePulses,
      getPosition: (d) => d.position,
      stroked: true,
      filled: true,
      radiusUnits: 'meters',
      lineWidthUnits: 'pixels',
      getLineWidth: (d) => 1 + d.magnitude * 0.4,
      getRadius: (d) => {
        const k = (now - d.start) / pulseDuration(d.magnitude);
        return pulseMaxRadius(d.magnitude) * (1 - Math.pow(1 - k, 3)); // ease-out
      },
      getLineColor: (d) => {
        const k = (now - d.start) / pulseDuration(d.magnitude);
        return [...QUAKE_COLOR, 255 * (1 - k)] as [number, number, number, number];
      },
      getFillColor: (d) => {
        const k = (now - d.start) / pulseDuration(d.magnitude);
        return [...QUAKE_COLOR, 60 * (1 - k) * (1 - k)] as [number, number, number, number];
      },
      updateTriggers: { getRadius: now, getLineColor: now, getFillColor: now },
    }),
    new ScatterplotLayer<Flight>({
      id: 'flights',
      data: flights,
      getPosition: (d) => projectFlight(d, now),
      radiusUnits: 'pixels',
      getRadius: (d) => (d.alt > 0 ? 1.4 : 0.8),
      getFillColor: (d) => [...FLIGHT_COLOR, d.alt > 0 ? 220 : 90] as [number, number, number, number],
      updateTriggers: { getPosition: now },
    }),
  ];

  deck.setProps({ viewState, layers });
  if (Math.floor(t / 500) !== Math.floor((t - dt * 1000) / 500)) renderStats(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- HUD ----------
const statsEl = document.getElementById('stats') as HTMLDivElement;
function renderStats(now: number) {
  const lastHour = quakes.filter((q) => now - q.time < 3600_000).length;
  const biggest = quakes.reduce<PulseEvent | null>((m, q) => (!m || q.magnitude > m.magnitude ? q : m), null);
  const airborne = flights.filter((f) => f.alt > 0).length;
  const where = flightCenter ? ` near ${fmtLat(flightCenter[1])} ${fmtLon(flightCenter[0])}` : '';

  statsEl.innerHTML = [
    `<div class="quake">${quakes.length} earthquakes · 24 h <span class="status">(${lastHour} in the last hour)</span></div>`,
    biggest ? `<div class="status">largest: ${escapeHtml(biggest.label ?? '')}</div>` : '',
    `<div class="flight">${airborne} aircraft aloft${where}</div>`,
    quakeStatus ? `<div class="status">${quakeStatus}</div>` : '',
    flightStatus ? `<div class="status">${flightStatus}</div>` : '',
  ].join('');
}

function fmtLat(v: number) {
  return `${Math.abs(v).toFixed(0)}°${v >= 0 ? 'N' : 'S'}`;
}
function fmtLon(v: number) {
  return `${Math.abs(v).toFixed(0)}°${v >= 0 ? 'E' : 'W'}`;
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
