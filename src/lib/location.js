import { store } from './store.js';

// Shares the phone's location with Lila while the app is open, so the agent can text a
// heads-up when you arrive somewhere you'd spend. Browsers (and the Android/iPhone web view)
// only report location while Lila is on screen, after the user allows it once.
const MIN_INTERVAL_MS = 60 * 1000;
const MIN_MOVE_METERS = 75;
let watchId = null;
let last = null;

function meters(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export const locationSupported = () => 'geolocation' in navigator;
export const isSharing = () => watchId !== null;

export function startSharing(onUpdate = () => {}, onError = () => {}) {
  if (watchId !== null || !locationSupported()) return;
  watchId = navigator.geolocation.watchPosition(async ({ coords }) => {
    const here = { lat: coords.latitude, lng: coords.longitude, at: Date.now() };
    if (last && here.at - last.at < MIN_INTERVAL_MS && meters(last, here) < MIN_MOVE_METERS) return;
    last = here;
    try { onUpdate(await store.location({ lat: here.lat, lng: here.lng })); } catch (error) { onError(error); }
  }, error => onError(new Error(error.code === 1 ? 'Location permission was denied.' : 'Location is unavailable right now.')), { enableHighAccuracy: true, maximumAge: 30000 });
}

export function stopSharing() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  last = null;
}
