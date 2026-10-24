
const token = process.env.BANDWIDTH_WEBHOOK_TOKEN;
const phone = process.env.BANDWIDTH_VERIFIED_PHONE_NUMBER;

if (!token || !phone) {
  throw new Error("Missing webhook token or verified phone in .env");
}

let target = process.argv[2] || process.env.BANDWIDTH_WEBHOOK_URL || "http://127.0.0.1:3002";
if (target === "--ngrok") {
  const response = await fetch("http://127.0.0.1:4040/api/tunnels", { signal: AbortSignal.timeout(5000) });
  const { tunnels } = await response.json();
  const matches = tunnels.filter(t => t.public_url.startsWith("https://") &&
    /^(https?:\/\/)?(localhost|127\.0\.0\.1):3002\/?$/.test(t.config.addr));
  if (matches.length !== 1) throw new Error("Expected one HTTPS tunnel to port 3002; supply a URL explicitly");
  target = matches[0].public_url;
}
const url = new URL(target);
if (url.pathname === "/") url.pathname = "/webhooks/bandwidth";
if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
  throw new Error("Use HTTPS for public callbacks");
}
url.searchParams.set("token", token);
const id = `pocket-simulated-${crypto.randomUUID()}`;
const time = new Date().toISOString();

try {
const response = await fetch(url, {
  method: "POST",
  redirect: "error",
  signal: AbortSignal.timeout(10000),
  headers: {
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  },
  body: JSON.stringify([
    {
      type: "message-received",
      time,
      description: "Incoming message received",
      to: process.env.BANDWIDTH_PHONE_NUMBER,
      message: {
        id, time,
        owner: process.env.BANDWIDTH_PHONE_NUMBER,
        applicationId: process.env.BANDWIDTH_APPLICATION_ID,
        text: "ALT",
        from: phone,
        to: [process.env.BANDWIDTH_PHONE_NUMBER],
        direction: "in",
      },
    },
  ]),
});

console.log("Target:", url.origin + url.pathname);
console.log("Synthetic message ID:", id);
console.log("HTTP status:", response.status);
if (response.status !== 204) process.exitCode = 1;
} catch {
  // Do not dump fetch errors: they can include the secret URL.
  console.error("Callback request failed. Check the server, tunnel, and ngrok inspector.");
  process.exitCode = 1;
}
