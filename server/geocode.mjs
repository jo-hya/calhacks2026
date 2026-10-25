// Finds coordinates for a recommended place so the Nearby map can pin it. Uses the same free
// OpenStreetMap service as place.mjs (no key; keep to about one request per second).
let nextAllowed = 0;

export async function geocodePlace({ name, area }, fetchImpl = fetch) {
  const wait = nextAllowed - Date.now();
  nextAllowed = Math.max(Date.now(), nextAllowed) + 1100;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const url = new URL('https://nominatim.openstreetmap.org/search');
  for (const [k, v] of Object.entries({ format: 'jsonv2', limit: 1, q: `${name} ${area}` })) url.searchParams.set(k, v);
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Lila-CalHacks-demo/0.1', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const [hit] = await response.json();
  const lat = Number(hit?.lat), lng = Number(hit?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

// Adds lat/lng where a place can be found. A place that can't be located is kept, just unpinned.
export async function locatePlaces(places, geocode = geocodePlace) {
  const located = [];
  for (const place of places) {
    let coords = null;
    try { coords = await geocode(place); } catch { coords = null; }
    located.push(coords ? { ...place, ...coords } : place);
  }
  return located;
}
