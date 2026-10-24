import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createWebhookServer } from "./bandwidth-webhook.mjs";

test("Bandwidth callback HTTP contract", async t => {
  const logs = [];
  const logger = Object.fromEntries(["log", "warn", "error"].map(key => [key, (...args) => logs.push(args.join(" "))]));
  const server = createWebhookServer({ secret: "test-secret", verifiedPhone: "+12025550101", logger });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const event = text => ({ type: "message-received", time: new Date().toISOString(), to: "+12025550102",
    message: { id: "test-inbound", owner: "+12025550102", direction: "in", from: "+12025550101", to: ["+12025550102"], text } });
  const post = (body, path = "/webhooks/bandwidth?token=test-secret") => fetch(base + path, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body),
  });
  await t.test("health", async () => assert.equal((await fetch(base + "/health")).status, 200));
  await t.test("ALT and KEEP batch", async () => {
    assert.equal((await post([event("ALT"), event(" keep ")])).status, 204);
    assert.ok(logs.includes("Command: ALT"));
    assert.ok(logs.includes("Command: KEEP"));
  });
  await t.test("wrong sender is acknowledged and explained", async () => {
    const e = event("ALT"); e.message.from = "+12025550103";
    const start = logs.length;
    assert.equal((await post([e])).status, 204);
    assert.ok(logs.slice(start).some(x => x.includes("sender does not match")));
    assert.ok(!logs.slice(start).some(x => x.startsWith("Received:")));
  });
  await t.test("status callbacks cannot trigger commands", async () => {
    const start = logs.length;
    assert.equal((await post(["message-delivered", "message-failed", "message-sending"].map(type => ({ ...event("ALT"), type })))).status, 204);
    assert.ok(!logs.slice(start).some(x => x.startsWith("Command:")));
  });
  await t.test("missing or wrong token", async () => {
    for (const path of ["/webhooks/bandwidth", "/webhooks/bandwidth?token=wrong"]) assert.equal((await post([], path)).status, 401);
  });
  await t.test("wrong route", async () => assert.equal((await post([], "/wrong")).status, 404));
  await t.test("malformed JSON and payloads", async () => {
    for (const body of ["{", {}, [null], [{ type: "message-received" }]]) assert.equal((await post(body)).status, 400);
  });
  await t.test("body limit counts bytes", async () => assert.equal((await post("é".repeat(50001))).status, 413));
  await t.test("logs exclude authentication token", () => assert.ok(logs.every(x => !x.includes("test-secret"))));
});
