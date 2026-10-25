# Lila phone rehearsal

This is a single-user demo. Bandwidth sends real SMS to the configured
verified phone. Nessie supplies actual sandbox API purchase records. With
`ANTHROPIC_API_KEY` set, the Claude agent answers (see [Claude agent](claude-agent.md));
without it, `server/conversation.mjs` is the scripted responder described below.

## Start

Use Node 22.18+ and the existing server-only `.env`. Required: `NESSIE_API_KEY`,
the existing `BANDWIDTH_*` account/application/phone/client/token settings.
`NESSIE_ACCOUNT_ID` is optional when an account is named `pocket`.

```powershell
npm install
npm run nessie:seed
npm run build
npm run demo
```

In a second terminal:

```powershell
ngrok http 3002
```

Stop the old `scripts/bandwidth-webhook.mjs` receiver before starting the demo;
both use port 3002. Keep both demo and ngrok running, and keep the laptop awake.

The server prints a private `/pair/<random-token>` link. Open it locally; on your
phone, replace `http://127.0.0.1:3002` with the ngrok HTTPS origin. If ngrok shows
its browser interstitial, tap Visit Site. Pairing installs an HttpOnly cookie.
The token changes whenever the server restarts. Do not share it publicly.

Set the Bandwidth application's **inbound** callback to:
`https://YOUR-NGROK-HOST/webhooks/bandwidth?token=YOUR_BANDWIDTH_WEBHOOK_TOKEN`.
The existing configuration matched the tunnel during setup; check it if the host changes.
`node --env-file=.env scripts/inspect-bandwidth.mjs` checks without printing secrets.

## Phone flow

### Install on your home screen

Open the private pairing link in Chrome (Android) or Safari (iPhone), then tap
**Install Lila**. Chrome can show its native installation prompt; otherwise
the button shows the browser-specific home-screen instructions. The installed
app has a Lila icon and a standalone window. This is an installable web app,
not an App Store / Play Store release. It still needs this demo server and tunnel.
Pairing lasts up to seven days while the same server instance is running. A
restart changes the pairing token; reopen the newly printed pairing link.
If the installed app asks to pair again, open the new pairing link in that app.
The offline notice does not cache financial data or queue budget changes.

1. In the paired app, Profile → Reset demo. Open **Try text flow**.
2. From the verified phone, text `DINNER` to the Bandwidth number displayed there.
   Alternatively copy/forward: `Friends: Dinner tonight? $55 each. Can I fit this in my budget?`
3. Lila replies: `Dining: $38. $55 dinner is $17 over. Move $20 Clothing to Dining? Reply YES <code> or CANCEL.`
4. Send the exact `YES <code>` from that reply within five minutes.
5. Lila confirms $58 Dining / $40 Clothing. Budgets and Activity update within
   about three seconds in the app. This changes category allocation, not bank money.
6. Reset from Profile to repeat. `CANCEL` / `KEEP` cancels the pending SMS proposal.

This is forwarding from a group chat into a private Lila conversation. Build
supports only the verified mobile recipient and SMS, not group MMS. Fetch.ai can
later reason about the forwarded text; it does not remove the carrier restriction.

## Browser rehearsal

**Try text flow → Forward dinner invite → Reply YES <code>** exercises the same
server budget operations without sending SMS. The preset user reply is a button,
so no typing or agent is required. Browser and SMS proposals are kept separate;
both share the same budget, so an intervening change invalidates an older review.

## Meaningful Nessie use

- The repeatable seed writes 12 labeled sandbox purchases and category-tagged merchants.
  It reuses existing labeled records, corrects their demo amounts if necessary,
  and never deletes purchases or changes unrelated transactions.
- The current API truncates fractional purchase dollars. Whole-dollar seed
  purchases preserve the original category totals: Dining $82, Clothing $90,
  Groceries $88, Transportation $109. Individual fixture amounts can differ
  from the browser-only demo. Returned amounts, never assumed seed values,
  determine the connected dashboard.
- Import reads `/accounts`, `/accounts/{id}/purchases`, and `/merchants`.
  Only completed/executed purchases in October 2026 count. Stable Nessie IDs
  prevent duplicate imports. Unknown merchant categories stop the import with
  a visible error rather than silently hiding spending.
- Imported records replace local sample transactions. Manual app expenses are
  separately labeled and retained on refresh. Refreshing from Nessie updates
  both the dashboard and the next SMS calculation; changed spending invalidates reviews.
- Nessie is refreshed before each scripted exchange and transfer confirmation.
  Provider errors fail closed; a purchase import failure cannot authorize a transfer.
- Account balance is not treated as a category budget. Budget reallocation is
  stored by Lila; it deliberately does not call Nessie's bank-transfer API.

## Teammate handoff and limitations

`respond(data, text, channel)` recognizes the $55 dinner scenario and exact approval
commands. It is now the fallback when no `ANTHROPIC_API_KEY` is set; the Claude agent
(`server/agent.mjs`) replaces it otherwise, keeping server-owned proposals and explicit
confirmation.

The paired app uses `/api/state`, `/api/sync`, `/api/message`, `/api/proposal`,
`/api/transfer`, `/api/expense`, and `/api/reset`. These use a pairing cookie,
not a production user identity or agent API credential. This is a single Node
process with serialized changes and atomic file replacement in ignored `.pocket/`.
Supabase, multi-user authorization and multi-instance transactions remain future work.

Inbound callbacks validate token, sender, recipient and application. Message IDs
and replies are persisted before side effects. Repeated callbacks cannot execute
another adjustment. Callbacks are acknowledged before provider work. Outbound
states distinguish queued, sending, accepted, delivered and failed. A crash or
timeout during send can leave delivery uncertain; it is not automatically retried.
Budget commits are retained on SMS failure. Inspect the app and start a fresh
DINNER review rather than assuming a failed SMS rolled back a budget change.
Build limits messages to ASCII, 129 custom characters, six/minute and 200/day.
The default outbound callback can remain with Build; without delivery callbacks
to Lila, `accepted` does not prove handset delivery.

## Hackathon alignment

Reviewed `13.0 Hacker Guide.pdf` (sponsor tracks on pages 11–12) and
`CalHacks Project Ideas - Google Docs.pdf` (Nessie transaction-backed dashboard
and social-budget ideas). Nessie's stated criteria are completeness, creativity,
and complexity. This implementation demonstrates a complete purchase-to-decision
chain and a user-approved action visible in the app. It keeps the social context
of a friend's invitation while discussing private financial data with Lila.

The guide links to Fetch.ai's separate criteria and says sponsor prizes can change.
This rehearsal does not itself establish eligibility for an AI/agent prize.
Location, automatic payments, group budgets, and voice remain outside this flow.

References: [Nessie documentation](https://prod.nessieisreal.com/docs),
[official API schema](https://prod.nessieisreal.com/nessie-openapi-spec.yaml),
[Bandwidth Build limits](https://dev.bandwidth.com/docs/messaging/build-free-trial/).

## Verification in this implementation

- 28 automated tests pass, including duplicate callbacks, approval isolation,
  stale reviews, failed outbound sends and callbacks arriving during slow provider work.
- Production build passes. A 390px browser rehearsal confirmed the live Nessie
  invitation/approval flow with $58/$40 results, no console errors and no horizontal overflow.
- Public HTTPS pairing and authenticated state reads work. Live Nessie returned
  12 purchases and the expected totals. The demo was reset after testing.
- The existing Bandwidth inbound callback matches the current tunnel and token.
  Real handset receipt/reply on this new flow still needs the user's phone test.
