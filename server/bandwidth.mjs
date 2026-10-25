import { SMS_MAX_CHARS } from './sms-text.mjs';

export async function sendSMS(text) {
  if (text.length > SMS_MAX_CHARS || /[^\x20-\x7E]/.test(text)) throw new Error('Reply exceeds Bandwidth trial SMS limits.');
  const env = process.env;
  const credentials = Buffer.from(`${env.BANDWIDTH_CLIENT_ID}:${env.BANDWIDTH_CLIENT_SECRET}`).toString('base64');
  const auth = await fetch('https://api.bandwidth.com/api/v1/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(10000) });
  if (!auth.ok) throw new Error(`Bandwidth authentication failed (${auth.status}).`);
  const { access_token } = await auth.json();
  const response = await fetch(`https://api.bandwidth.com/v1/build/accounts/${env.BANDWIDTH_ACCOUNT_ID}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: env.BANDWIDTH_APPLICATION_ID, from: env.BANDWIDTH_PHONE_NUMBER, to: [env.BANDWIDTH_VERIFIED_PHONE_NUMBER], text, tag: 'pocket-scripted-demo' }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Bandwidth send failed (${response.status}).`);
  return (await response.json()).id;
}
