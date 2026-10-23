/// <reference lib="webworker" />
/**
 * Composites the base texture off the main thread: a dimmed, desaturated
 * daytime Earth on the sunlit side, city lights on the night side, and a soft
 * twilight band between them. Re-rendered every couple of minutes as the
 * terminator moves (~0.5° per 2 min).
 */

interface InitMsg {
  type: 'init';
  dayUrl: string;
  lightsUrl: string;
  width: number;
  height: number;
}
interface RenderMsg {
  type: 'render';
  sunLon: number;
  sunLat: number;
}

// ---------- look ----------
const BASE: [number, number, number] = [6, 10, 20]; // deep night ocean
const DAY_BRIGHTNESS = 0.46;
const DAY_SATURATION = 0.62;
const LIGHTS_TINT: [number, number, number] = [0.95, 0.84, 0.62]; // pale sodium gold, quieter than quake orange
const TWILIGHT_GLOW: [number, number, number] = [26, 16, 30];

let W = 0;
let H = 0;
let day: Uint8ClampedArray | null = null;
let lights: Uint8ClampedArray | null = null;
let canvas: OffscreenCanvas;
let ctx: OffscreenCanvasRenderingContext2D;
let out: ImageData;
let ready: Promise<void> | null = null;

async function loadPixels(url: string): Promise<Uint8ClampedArray> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = new OffscreenCanvas(W, H);
  const cx = c.getContext('2d')!;
  cx.drawImage(bmp, 0, 0, W, H);
  return cx.getImageData(0, 0, W, H).data;
}

async function init(msg: InitMsg) {
  W = msg.width;
  H = msg.height;
  canvas = new OffscreenCanvas(W, H);
  ctx = canvas.getContext('2d')!;
  out = ctx.createImageData(W, H);
  const [d, l] = await Promise.allSettled([loadPixels(msg.dayUrl), loadPixels(msg.lightsUrl)]);
  day = d.status === 'fulfilled' ? d.value : null;
  lights = l.status === 'fulfilled' ? l.value : null;
  if (!day && !lights) throw new Error('base imagery unavailable');
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function render(sunLon: number, sunLat: number): ImageBitmap {
  const rad = Math.PI / 180;
  const sinDec = Math.sin(sunLat * rad);
  const cosDec = Math.cos(sunLat * rad);

  const cosDL = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const lon = -180 + ((x + 0.5) / W) * 360;
    cosDL[x] = Math.cos((lon - sunLon) * rad);
  }

  const o = out.data;
  for (let y = 0; y < H; y++) {
    const lat = (90 - ((y + 0.5) / H) * 180) * rad;
    const a = Math.sin(lat) * sinDec;
    const b = Math.cos(lat) * cosDec;
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      const s = a + b * cosDL[x]; // sine of the sun's elevation
      const dayK = smooth(-0.07, 0.14, s);
      const nightK = 1 - smooth(-0.14, 0.02, s);
      const glow = Math.exp(-(s * s) / 0.0036); // narrow band at the terminator

      let r = BASE[0] + TWILIGHT_GLOW[0] * glow;
      let g = BASE[1] + TWILIGHT_GLOW[1] * glow;
      let bl = BASE[2] + TWILIGHT_GLOW[2] * glow;

      if (day && dayK > 0) {
        const dr = day[i], dg = day[i + 1], db = day[i + 2];
        const lum = 0.3 * dr + 0.59 * dg + 0.11 * db;
        const k = dayK * DAY_BRIGHTNESS;
        r += (lum + (dr - lum) * DAY_SATURATION) * 0.9 * k;
        g += (lum + (dg - lum) * DAY_SATURATION) * k;
        bl += (lum + (db - lum) * DAY_SATURATION) * 1.08 * k;
      }
      if (lights && nightK > 0) {
        const L = Math.max(lights[i], lights[i + 1], lights[i + 2]);
        const v = L > 14 ? (L - 14) * 1.08 * nightK : 0; // drop sensor noise floor
        r += v * LIGHTS_TINT[0];
        g += v * LIGHTS_TINT[1];
        bl += v * LIGHTS_TINT[2];
      }
      o[i] = r;
      o[i + 1] = g;
      o[i + 2] = bl;
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas.transferToImageBitmap();
}

self.onmessage = async (e: MessageEvent<InitMsg | RenderMsg>) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      ready = init(msg);
      await ready;
      self.postMessage({ type: 'ready', hasDay: !!day, hasLights: !!lights });
    } else {
      if (!ready) return;
      await ready;
      const bitmap = render(msg.sunLon, msg.sunLat);
      (self as unknown as Worker).postMessage({ type: 'frame', bitmap }, [bitmap]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message });
  }
};
