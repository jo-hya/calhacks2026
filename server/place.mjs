// Turns coordinates from the phone into "where the user is", e.g. Gather (restaurant)
// -> dining, using OpenStreetMap's free reverse geocoder (no API key; max ~1 request/second).
const KINDS = [
  ['dining', ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'bakery', 'coffee']],
  ['groceries', ['supermarket', 'grocery', 'greengrocer', 'convenience', 'deli', 'butcher']],
  ['shopping', ['clothes', 'shoes', 'mall', 'department_store', 'boutique', 'books', 'gift', 'jewelry', 'electronics']],
  ['transport', ['fuel', 'parking', 'taxi', 'car_rental', 'charging_station']],
];

export function categoryForKind(kind) {
  return KINDS.find(([, kinds]) => kinds.includes(kind))?.[0] ?? null;
}

export async function lookupPlace(lat, lng, fetchImpl = fetch) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  for (const [k, v] of Object.entries({ format: 'jsonv2', lat, lon: lng, zoom: 18, addressdetails: 1 })) url.searchParams.set(k, v);
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Pocket-CalHacks-demo/0.1', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Place lookup failed (${response.status}).`);
  const place = await response.json();
  const a = place.address || {};
  return {
    place: place.name || a.amenity || a.shop || null,
    kind: place.type,
    category: categoryForKind(place.type),
    city: a.city || a.town || a.village || null,
    region: a.state || null,
  };
}
