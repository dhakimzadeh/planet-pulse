// adsb.lol: ODbL, attribution required. Queries are a circle of at most 250 nmi,
// and the limit is per IP, so the browser calls it directly (never via a server).
// Their docs ask production users to contact them first, and an API key will be
// required in future.
const API = 'https://api.adsb.lol/v2/point';
export const MAX_RADIUS_NM = 250;

export interface Flight {
  hex: string;
  callsign: string;
  lon: number;
  lat: number;
  /** meters; 0 when on the ground */
  alt: number;
  /** ground speed, knots */
  gs: number;
  /** degrees from true north */
  track: number;
  /** ms since epoch when this position was valid */
  at: number;
}

interface AdsbAircraft {
  hex: string;
  flight?: string | null;
  lat?: number | null;
  lon?: number | null;
  alt_baro?: number | string | null;
  gs?: number | null;
  track?: number | null;
  seen_pos?: number | null;
}

export async function fetchFlights(lat: number, lon: number, radiusNm = MAX_RADIUS_NM): Promise<Flight[]> {
  const url = `${API}/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.min(radiusNm, MAX_RADIUS_NM)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`adsb.lol ${res.status}`);
  const json = (await res.json()) as { ac?: AdsbAircraft[]; now?: number };
  const now = json.now ?? Date.now();

  const flights: Flight[] = [];
  for (const a of json.ac ?? []) {
    if (a.lat == null || a.lon == null) continue;
    const altFt = typeof a.alt_baro === 'number' ? a.alt_baro : 0; // "ground" -> 0
    flights.push({
      hex: a.hex,
      callsign: (a.flight ?? '').trim(),
      lon: a.lon,
      lat: a.lat,
      alt: altFt * 0.3048,
      gs: a.gs ?? 0,
      track: a.track ?? 0,
      at: now - (a.seen_pos ?? 0) * 1000,
    });
  }
  return flights;
}

const EARTH_R = 6371008.8;
const KT_TO_MS = 0.514444;
const toRad = Math.PI / 180;

/** Dead-reckon a flight forward to `t` so planes glide between polls. */
export function projectFlight(f: Flight, t: number): [number, number, number] {
  // Cap extrapolation so a stale record can't drift off across the map.
  const dt = Math.min(Math.max(0, (t - f.at) / 1000), 60);
  const d = (f.gs * KT_TO_MS * dt) / EARTH_R; // angular distance
  if (d === 0) return [f.lon, f.lat, f.alt];

  const lat1 = f.lat * toRad;
  const lon1 = f.lon * toRad;
  const brg = f.track * toRad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
  const lon2 =
    lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [((lon2 / toRad + 540) % 360) - 180, lat2 / toRad, f.alt];
}
