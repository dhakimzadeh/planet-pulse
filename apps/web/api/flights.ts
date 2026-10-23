/**
 * Web-only relay for adsb.lol. Its API sends no CORS headers, so browsers
 * can't call it directly; native desktop and TV builds should still fetch
 * adsb.lol themselves (per-IP limits). Coordinates are rounded and responses
 * edge-cached for a few seconds so many viewers share one upstream request.
 */
const UPSTREAM = 'https://api.adsb.lol/v2/point';
const MAX_RADIUS_NM = 250;

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat'));
  const lon = Number(q.get('lon'));
  const r = Math.min(Number(q.get('r') ?? MAX_RADIUS_NM), MAX_RADIUS_NM);
  if (![lat, lon, r].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || r <= 0) {
    return Response.json({ error: 'lat, lon and r must be numbers' }, { status: 400 });
  }

  const upstream = await fetch(`${UPSTREAM}/${lat.toFixed(1)}/${lon.toFixed(1)}/${Math.round(r)}`, {
    headers: { 'user-agent': 'planet-pulse (+https://github.com/dhakimzadeh/planet-pulse)' },
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'public, s-maxage=8, stale-while-revalidate=8',
    },
  });
}
