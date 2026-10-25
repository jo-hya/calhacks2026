// Real photos for saved places, from Google Places. The key stays on the server: the app
// loads a photo through /api/place-photo, which fetches it here. Without a key, places
// keep the letter thumbnail.
const key = () => process.env.GOOGLE_MAPS_API_KEY;
export const PHOTO_NAME = /^places\/[\w-]+\/photos\/[\w-]+$/;

// Looks the place up on Google: returns its photo resource name ("places/ID/photos/REF") and
// its location, or {} when there's no match.
export async function findPlaceMatch({ name, area, lat, lng }, fetchImpl = fetch) {
  if (!key()) return {};
  const body = { textQuery: `${name} ${area ?? ''}`.trim(), maxResultCount: 1 };
  if (lat != null && lng != null) body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 500 } };
  const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'places.photos,places.location' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return {};
  const [hit] = (await response.json()).places || [];
  const match = {};
  if (hit?.photos?.[0]?.name) match.photo = hit.photos[0].name;
  if (Number.isFinite(hit?.location?.latitude) && Number.isFinite(hit?.location?.longitude)) { match.lat = hit.location.latitude; match.lng = hit.location.longitude; }
  return match;
}

// Fetches the image bytes for a photo resource name the server has already validated.
export async function fetchPlacePhoto(name, fetchImpl = fetch) {
  if (!key() || !PHOTO_NAME.test(name)) return null;
  const response = await fetchImpl(`https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&key=${encodeURIComponent(key())}`, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  return { type: response.headers.get('content-type') || 'image/jpeg', bytes: Buffer.from(await response.arrayBuffer()) };
}
