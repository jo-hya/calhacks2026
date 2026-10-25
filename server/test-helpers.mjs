import { get } from 'node:http';

// Pairs a test server the way the app does and returns the session cookie for API calls.
// Uses node:http so tests that stub global fetch still reach the local server.
export function pairedCookie(base, token) {
  return new Promise((resolve, reject) => {
    get(`${base}/pair/${token}`, res => {
      res.resume();
      const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
      cookie ? resolve(cookie) : reject(new Error(`Pairing failed (${res.statusCode}).`));
    }).on('error', reject);
  });
}
