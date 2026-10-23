/**
 * The single event format every layer speaks.
 *
 * The ingest server normalizes each public feed into this shape so new
 * layers plug in without client changes. Flights skip the server (adsb.lol
 * rate-limits per IP), but the client maps them into the same shape.
 */
export type PulseEventType =
  | 'earthquake'
  | 'volcano'
  | 'lightning'
  | 'flight'
  | 'ship'
  | 'fire'
  | 'aurora'
  | 'satellite';

export interface PulseEvent {
  /** Stable id from the source, prefixed by type (e.g. "earthquake:us7000abcd") */
  id: string;
  type: PulseEventType;
  /** [longitude, latitude] in degrees, optional altitude in meters */
  position: [number, number] | [number, number, number];
  /** Event time, ms since epoch */
  time: number;
  /** Type-specific magnitude: Richter for quakes, flash energy for lightning, etc. */
  magnitude: number;
  /** Short human-readable label, e.g. "M4.2 – 10 km SW of Ridgecrest" */
  label?: string;
  /** Source attribution, required for ODbL layers */
  source: string;
  /** Optional type-specific details for captions (e.g. place, depthKm) */
  meta?: Record<string, string | number>;
}
