/**
 * Subsolar point (where the sun is directly overhead) for a given time.
 * Low-precision solar ephemeris (~0.01° — far finer than a pixel on the globe).
 */
export function subsolarPoint(t = Date.now()): { lon: number; lat: number } {
  const n = t / 86400000 + 2440587.5 - 2451545.0; // days since J2000
  const rad = Math.PI / 180;
  const L = mod(280.46 + 0.9856474 * n, 360);
  const g = mod(357.528 + 0.9856003 * n, 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;

  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const gmst = mod(280.46061837 + 360.98564736629 * n, 360);

  return { lon: mod(ra - gmst + 180, 360) - 180, lat: dec / rad };
}

function mod(a: number, b: number) {
  return ((a % b) + b) % b;
}
