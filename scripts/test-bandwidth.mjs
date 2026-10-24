
const env = process.env;

const required = [
  "BANDWIDTH_ACCOUNT_ID",
  "BANDWIDTH_APPLICATION_ID",
  "BANDWIDTH_PHONE_NUMBER",
  "BANDWIDTH_VERIFIED_PHONE_NUMBER",
  "BANDWIDTH_CLIENT_ID",
  "BANDWIDTH_CLIENT_SECRET",
];

for (const key of required) {
  if (!env[key]) throw new Error(`Missing ${key} in .env`);
}

// 1. Exchange API credentials for a temporary access token.
const basicAuth = Buffer.from(
  `${env.BANDWIDTH_CLIENT_ID}:${env.BANDWIDTH_CLIENT_SECRET}`
).toString("base64");

const tokenResponse = await fetch(
  "https://api.bandwidth.com/api/v1/oauth2/token",
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  }
);

if (!tokenResponse.ok) {
  throw new Error(
    `Authentication failed: ${tokenResponse.status} ${
      await tokenResponse.text()
    }`
  );
}

const { access_token } = await tokenResponse.json();

// 2. Send a custom text to your verified Android number.
const message = {
  applicationId: env.BANDWIDTH_APPLICATION_ID,
  to: [env.BANDWIDTH_VERIFIED_PHONE_NUMBER],
  from: env.BANDWIDTH_PHONE_NUMBER,
  text: "Pocket: You have $34 left for cafes. Reply ALT to see options.",
  tag: "pocket-first-test",
};

const url =
  `https://api.bandwidth.com/v1/build/accounts/` +
  `${env.BANDWIDTH_ACCOUNT_ID}/messages`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(message),
});

const result = await response.text();

console.log("SMS request status:", response.status);
console.log("Result:", result);

if (!response.ok) process.exitCode = 1;
