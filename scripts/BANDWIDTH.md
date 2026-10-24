# Bandwidth callback debugging

Run these commands from the project root. Node 22 loads `.env` with
`--env-file=.env`; the scripts do not load it automatically. Existing shell
variables override `.env`, so clear stale shell values if configuration differs.
Never put server credentials in Expo public variables.

```powershell
# Terminal 1 (restart an existing server to pick up code changes)
node --env-file=.env scripts/bandwidth-webhook.mjs
# Terminal 2
ngrok http 3002
# Local simulation: no real SMS is sent
node --env-file=.env scripts/test-webhook.mjs
# Discover the current HTTPS tunnel from localhost:4040
node --env-file=.env scripts/test-webhook.mjs --ngrok
# Or supply the current HTTPS origin or full callback path
node --env-file=.env scripts/test-webhook.mjs https://YOUR-CURRENT-HOST
# Automated tests use fake credentials and an ephemeral local port
node --test scripts/bandwidth-webhook.test.mjs
```

The target precedence is CLI argument, `BANDWIDTH_WEBHOOK_URL`, then localhost.
The simulator adds `/webhooks/bandwidth` to a bare origin and adds the token from
the environment without printing it. Synthetic message IDs start with
`pocket-simulated-`, to distinguish tests from real phone replies.

The receiver needs `BANDWIDTH_WEBHOOK_TOKEN` and
`BANDWIDTH_VERIFIED_PHONE_NUMBER`. The simulator also uses
`BANDWIDTH_PHONE_NUMBER` and `BANDWIDTH_APPLICATION_ID`. The outbound script
additionally needs account ID, client ID, and client secret. Its Build API URL
is hardcoded; `BANDWIDTH_BASE_URL` is currently unused.

## Dashboard check (manual; no settings changed by these scripts)

The inbound callback on the application serving your Build number must be:
`https://YOUR-CURRENT-HOST/webhooks/bandwidth?token=YOUR_EXISTING_TOKEN`

Substitute your existing token privately. A health URL or bare origin is not a
callback URL. The outbound callback is separate; configuring it alone does not
route inbound replies. Verify the application/number association and compare
the application ID with `BANDWIDTH_APPLICATION_ID` locally. The receiver uses
the query token, not Basic Auth or the Bandwidth OAuth client secret.

Open http://127.0.0.1:4040 to inspect POST requests. Do not share raw inspector
exports: URLs contain your token and payloads contain phone numbers/messages.

- No POST after a real reply: check Bandwidth inbound message logs, the inbound
  callback URL and the application serving the number. Confirm Android sent SMS
  from the verified SIM to your Build number.
- Offline ngrok error: update/restart the tunnel and compare the exact hostname.
- 502: ngrok cannot reach the local server on port 3002.
- 404: incorrect route or method.
- 401: missing or incorrect query token.
- 400: invalid JSON or malformed callback array.
- 204 with ignored sender: compare the verified phone using exact E.164 format.
- 204 and `Received: ALT`: inbound callback processing succeeded.

The receiver recognizes ALT/KEEP but does not yet run an AI agent or send replies.
Before adding side effects, handle duplicate message IDs (Bandwidth can retry)
and queue slow work so callbacks are acknowledged within Bandwidth's 10-second
timeout.

References: https://dev.bandwidth.com/docs/messaging/webhooks/ and
https://dev.bandwidth.com/docs/messaging/build-free-trial/
