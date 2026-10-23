import type { PulseEvent } from '@planet-pulse/events';

// USGS real-time feed: every quake worldwide in the past 24 h, updated every minute.
// Public domain, CORS-enabled.
const FEED_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number };
  geometry: { coordinates: [number, number, number] };
}

export async function fetchEarthquakes(): Promise<PulseEvent[]> {
  const res = await fetch(FEED_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const json = (await res.json()) as { features: UsgsFeature[] };

  return json.features
    .filter((f) => f.properties.mag !== null)
    .map((f) => {
      const [lon, lat, depth] = f.geometry.coordinates;
      const mag = f.properties.mag ?? 0;
      return {
        id: `earthquake:${f.id}`,
        type: 'earthquake' as const,
        position: [lon, lat] as [number, number],
        time: f.properties.time,
        magnitude: mag,
        label: `M${mag.toFixed(1)} – ${f.properties.place ?? 'unknown location'}`,
        source: 'USGS',
        meta: { place: f.properties.place ?? 'unknown location', depthKm: Math.round(depth ?? 0) },
      };
    });
}
