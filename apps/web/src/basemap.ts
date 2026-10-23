import { subsolarPoint } from './sun';

/**
 * Living light: a real day/night line. Returns the current base texture
 * (an ImageBitmap, or a plain image URL as a fallback) via `onFrame`.
 */
const W = 4096;
const H = 2048;
const REFRESH_MS = 120_000;

const gibs = (layer: string, format: string) =>
  'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0' +
  `&LAYERS=${layer}&STYLES=&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${W}&HEIGHT=${H}&FORMAT=${format}`;

export const DAY_URL = gibs('BlueMarble_ShadedRelief_Bathymetry', 'image/jpeg');
export const LIGHTS_URL = gibs('VIIRS_CityLights_2012', 'image/jpeg');

export function startBasemap(onFrame: (image: ImageBitmap | string) => void, onStatus: (s: string) => void) {
  // Until the composite is ready (or if it fails), show city lights as before.
  onFrame(LIGHTS_URL);

  let worker: Worker;
  try {
    worker = new Worker(new URL('./basemap.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    onStatus('day/night unavailable');
    return;
  }

  let prev: ImageBitmap | null = null;
  const tick = () => {
    const sun = subsolarPoint();
    worker.postMessage({ type: 'render', sunLon: sun.lon, sunLat: sun.lat });
  };

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') {
      if (!m.hasDay) onStatus('daytime imagery unavailable');
      tick();
      setInterval(tick, REFRESH_MS);
    } else if (m.type === 'frame') {
      onFrame(m.bitmap);
      // Free the old texture's source a moment later, after deck has swapped.
      const old = prev;
      prev = m.bitmap;
      setTimeout(() => old?.close(), 2000);
    } else if (m.type === 'error') {
      onStatus(`day/night unavailable (${m.message})`);
    }
  };
  worker.postMessage({ type: 'init', dayUrl: DAY_URL, lightsUrl: LIGHTS_URL, width: W, height: H });
}
