# Claude agent

Lila's texts are answered by a Claude agent (`server/agent.mjs`) when
`ANTHROPIC_API_KEY` is set. Without it, the scripted responder in
`server/conversation.mjs` answers as before.

## Run it

Add to `.env` (see `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then start the demo as usual (`npm run build`, `npm run demo`, `ngrok http 3002`).
The server prints `Claude agent active`. Everything else (pairing, Nessie sync,
the Android app, SMS webhook) is unchanged.

## What it does

Text Lila anything from the verified phone, or use **Try text flow** in the app:

1. **Forward the dinner invite.** The agent reads your budgets and Nessie purchases and
   says how much room you have, e.g. "Dining has $38; the $55 dinner is $17 over",
   then offers two paths:
   - **Move budget**: ask in your own words (e.g. "move $20 from Clothing to Dining")
     and Lila applies it right away, with no second confirmation.
   - **ALT**: it searches the web for cheaper places near you (tell it your area,
     e.g. "Berkeley 94704"), and if you pick one, proposes paying for it.
2. **Budget changes apply at once.** Moves and changes to your name, area, preferences,
   or category budgets take effect when you ask, and you can text **undo** to reverse
   the last one (only while the budgets still match that change). An ALT payment needs
   a **YES**: it is created as a purchase in your Nessie sandbox account and imported
   like any other. Nothing is charged for real.
3. **Location heads-ups.** In **Try text flow**, *Share my location* reports where the
   phone is while Lila is open. When you arrive somewhere you'd spend (a restaurant,
   a clothing store...), the agent texts you if that budget is tight. *Pretend I'm at...*
   buttons trigger the same thing for a demo without walking anywhere. Places come from
   OpenStreetMap; one text per place every 20 minutes.

**Purchases and transaction edits need approval, enforced in code.** The agent can only
propose them; `confirm_pending_action` refuses unless the user's own message (not a location update)
is exactly YES (case-insensitive), the action matches the pending action at the start
of the turn, it hasn't expired (30 minutes), the budgets haven't changed since the
proposal, and Nessie was refreshed for this turn. Two approvals that arrive together
can only start one payment.
Budget moves never go through a pending action. They are refused for location updates,
forwarded text, and turns where Nessie could not be refreshed.
Payment attempts are saved before submission. After a timeout or restart, YES only
checks Nessie for that action's purchase; it never resubmits it. Uncertain payments
remain available for checking after expiry and block replacement or cancellation.
If Nessie cannot confirm the outcome, check the sandbox before resetting the demo.

## Details

- Replies are cleaned to plain ASCII and split into texts of at most 129 characters
  (Bandwidth free trial limit; `POCKET_SMS_MAX_CHARS` raises it on a paid account).
- Claude thinks outside the server's one-at-a-time queue, so the app stays responsive
  during a reply; only the actual budget changes take turns.
- If Claude can't finish a reply, the user is told an approved action may have
  completed and to check the app before trying again.
- **Reset demo** also deletes the Nessie purchases the agent paid for.
- `POCKET_MODEL` (default `claude-opus-5-5`), `POCKET_EFFORT` (default `medium`; `low`
  replies faster), `POCKET_WEB_SEARCH=off` turns off web search.

## Location limits

Browsers and the app's web view only report location while Lila is open on screen.
Texting you while the phone is in your pocket needs a native background-location
plugin in the Android build (and "Allow all the time"). That's a next step, not built yet.

## iPhone

The quickest way onto an iPhone needs no Xcode: open the pairing link through the
ngrok HTTPS address in **Safari**, then **Share → Add to Home Screen** (the *Install
Lila* button explains this). It opens full screen like an app, and location works
over HTTPS while it's open. A native iOS build (like the Android one) is possible with
Capacitor but needs Xcode on a Mac and isn't set up yet.
