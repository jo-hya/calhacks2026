
import http from "node:http";
import { pathToFileURL } from "node:url";

export function createWebhookServer({ secret = process.env.BANDWIDTH_WEBHOOK_TOKEN,
  verifiedPhone = process.env.BANDWIDTH_VERIFIED_PHONE_NUMBER, logger = console } = {}) {

if (!secret || !verifiedPhone) {
  throw new Error("Missing webhook token or verified phone; run with --env-file=.env");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  // Exclude query strings because they contain the secret.
  res.on("finish", () => logger.log(`${req.method} ${url.pathname} -> ${res.statusCode}`));

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("pocket webhook online");
    return;
  }

  if (
    req.method !== "POST" ||
    url.pathname !== "/webhooks/bandwidth"
  ) {
    res.writeHead(404);
    res.end();
    return;
  }

  if (url.searchParams.get("token") !== secret) {
    logger.warn("Rejected callback: missing or incorrect token");
    res.writeHead(401);
    res.end();
    return;
  }

  try {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
      size += chunk.length;
      if (size > 100000) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }

    const events = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (!Array.isArray(events) || events.some(event => !event || typeof event.type !== "string" ||
      (event.type === "message-received" && (!event.message || typeof event.message.from !== "string" || typeof event.message.text !== "string")))) {
      res.writeHead(400);
      res.end();
      return;
    }

    for (const event of events) {
      const msg = event.message;

      if (event.type === "message-received") {
        if (msg?.from === verifiedPhone) {
          logger.log("Received:", msg.text);
          logger.log("Message ID:", msg.id);
          const command = msg.text.trim().toUpperCase();
          logger.log("Command:", ["ALT", "KEEP"].includes(command) ? command : "unrecognized");
        } else {
          logger.warn("Ignored inbound callback: sender does not match verified phone");
        }
      } else if (event.type === "message-delivered") {
        logger.log("Delivered:", msg?.id);
      } else if (event.type === "message-failed") {
        logger.log("Failed:", event.description);
      } else {
        logger.log("Ignored callback type:", event.type);
      }
    }

    res.writeHead(204);
    res.end();
  } catch (error) {
    logger.error("Webhook error: invalid JSON or callback processing failed");
    res.writeHead(400);
    res.end();
  }
});

return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
const PORT = 3002;
const server = createWebhookServer();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Pocket webhook listening on port ${PORT}`);
});
}
