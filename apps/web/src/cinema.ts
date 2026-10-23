import type { PulseEvent } from '@planet-pulse/events';

/**
 * Event cinema: a big event triggers a slow camera dive, a short readable
 * caption, then a drift back to orbit. Pure camera choreography — the caller
 * owns the view state and applies whatever `update` returns.
 */

export interface View {
  longitude: number;
  latitude: number;
  zoom: number;
}

type Phase = 'dive' | 'hold' | 'return';

const DIVE_MS = 7000;
const HOLD_MS = 13000;
const RETURN_MS = 8000;
const DIVE_ZOOM = 1.7; // above orbit zoom
export const ORBIT_LATITUDE = 22;

interface Shot {
  event: PulseEvent;
  phase: Phase;
  phaseStart: number;
  from: View;
  to: View;
}

export interface CinemaHooks {
  /** Show the caption for an event (null hides it). */
  caption(event: PulseEvent | null): void;
  /** Called once when the camera arrives over the event. */
  arrive(event: PulseEvent): void;
  /** Called every ~3 s during the hold, for repeating pulses. */
  heartbeat(event: PulseEvent): void;
}

export class Cinema {
  private shot: Shot | null = null;
  private pending: PulseEvent | null = null;
  private lastBeat = 0;

  constructor(
    private orbitZoom: () => number,
    private hooks: CinemaHooks,
  ) {}

  get active() {
    return this.shot !== null;
  }

  /** Queue an event. If one is already playing, keep only the biggest waiting. */
  trigger(event: PulseEvent) {
    if (this.shot) {
      if (event.id === this.shot.event.id) return;
      if (!this.pending || event.magnitude > this.pending.magnitude) this.pending = event;
      return;
    }
    this.pending = event;
  }

  /** User grabbed the globe: hand control back immediately. */
  cancel() {
    if (this.shot) this.hooks.caption(null);
    this.shot = null;
    this.pending = null;
  }

  update(t: number, view: View): View | null {
    if (!this.shot && this.pending) {
      const event = this.pending;
      this.pending = null;
      const [lon, lat] = event.position;
      this.shot = {
        event,
        phase: 'dive',
        phaseStart: t,
        from: { ...view },
        // Sit the camera a little south of high-latitude events so the globe's edge isn't in frame.
        to: { longitude: lon, latitude: clamp(lat, -60, 60), zoom: this.orbitZoom() + DIVE_ZOOM },
      };
    }
    const s = this.shot;
    if (!s) return null;

    const elapsed = t - s.phaseStart;
    if (s.phase === 'dive') {
      const k = Math.min(1, elapsed / DIVE_MS);
      if (k > 0.72) this.hooks.caption(s.event);
      if (k >= 1) {
        s.phase = 'hold';
        s.phaseStart = t;
        this.lastBeat = t;
        this.hooks.arrive(s.event);
      }
      return fly(s.from, s.to, easeInOut(k));
    }
    if (s.phase === 'hold') {
      if (t - this.lastBeat > 3000) {
        this.lastBeat = t;
        this.hooks.heartbeat(s.event);
      }
      // A barely perceptible drift keeps the hold from feeling frozen.
      const drift = (elapsed / 1000) * 0.08;
      if (elapsed >= HOLD_MS) {
        s.phase = 'return';
        s.phaseStart = t;
        s.from = { ...s.to, longitude: s.to.longitude + drift };
        s.to = { longitude: s.from.longitude, latitude: ORBIT_LATITUDE, zoom: this.orbitZoom() };
        this.hooks.caption(null);
      }
      return { ...s.to, longitude: s.to.longitude + drift };
    }
    // return
    const k = Math.min(1, elapsed / RETURN_MS);
    if (k >= 1) {
      this.shot = null;
      return { ...s.to };
    }
    return fly(s.from, s.to, easeInOut(k));
  }
}

/** Interpolate along the shortest longitude path, easing out a little zoom on long moves. */
function fly(a: View, b: View, e: number): View {
  const dLon = ((b.longitude - a.longitude + 540) % 360) - 180;
  const dLat = b.latitude - a.latitude;
  const arc = Math.min(1, Math.hypot(dLon, dLat) / 100) * 0.5;
  return {
    longitude: ((a.longitude + dLon * e + 540) % 360) - 180,
    latitude: a.latitude + dLat * e,
    zoom: a.zoom + (b.zoom - a.zoom) * e - arc * Math.sin(Math.PI * e),
  };
}

function easeInOut(k: number) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
