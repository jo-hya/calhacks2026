# Lila

A simple budget app for making room for everyday life. Built with React and Vite for Cal Hacks 13.0.

## Connected SMS + Nessie demo

For a real Android debug APK installed by USB, see [Android setup](docs/android-usb.md).
The commands are `npm run android:build` and `npm run android:run` once the SDK is ready.

See [phone rehearsal setup](docs/phone-demo.md). Run `npm run nessie:seed`,
`npm run build`, and `npm run demo`, then `ngrok http 3002` in another terminal.
Open the private pairing link printed by the server. **Try text flow** rehearses
preset messages in the browser; texting **DINNER** from the verified phone runs
real Bandwidth SMS with shared app updates.

With `ANTHROPIC_API_KEY` set, replies come from a **Claude agent** that reasons over
the Nessie purchases, offers cheaper alternatives (ALT) or a budget move (KEEP), pays
approved alternatives through Nessie, and can text location heads-ups. See
[Claude agent](docs/claude-agent.md). Without the key, a scripted responder answers.
Lila can also be talked to in the app (Cartesia) and remembers what users tell it (Moss); see
[Voice and memory](docs/voice-memory.md).

## Run locally

Requires Node.js 22.18+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (normally http://127.0.0.1:5173).

```sh
npm test
npm run build
npm run preview
```

## What works

- Mobile-first spending feed and budget dashboard based on the Figma Codex page, with purple styling, Poppins typography, and locally stored design assets.
- Persistent bottom navigation for Home, Budgets, quick actions, Activity, and Profile. Larger screens keep the same narrow mobile layout.
- Category details, searchable/filterable transactions, and manual expense entry.
- Budget transfers with a review/confirmation step, validation, expiration, stale-state checks, and duplicate-action protection within the local demo.
- Adjustment history, browser-local persistence, and demo reset.
- Keyboard-accessible dialogs and mobile navigation.

The demo uses **October 2026** and a fictional user, Sam. It starts with $38 remaining in Dining and $60 in Clothing (the stable `shopping` category ID). Moving $20 from Clothing to Dining leaves $58 and $40 respectively. Total allocation and transaction spending stay unchanged. Existing saved purchases and Groceries are preserved; amounts are calculated from the demo data rather than copied from Figma's illustrative figures. Native phone status and gesture bars are left to the device.

## Demo walkthrough

1. On Home, tap the notification bell, then **Make room for dinner**.
2. Review a $20 transfer from Clothing to Dining. No allocation changes before confirmation.
3. Confirm the transfer. Budgets shows $58 left in Dining and $40 in Clothing; Activity records the adjustment.
4. Reload to verify persistence. Profile → **Reset demo** restores the original scenario.
5. Tap the center **+** → **Add a purchase** to update the feed and category spending. Home → **View all** opens searchable transactions.
6. In connected mode with the Claude agent, text Lila: "move $20 from Clothing to Dining". It applies right away and tells you the new balances; text **undo that** to reverse it. Purchases still need a **YES**.

## Implementation boundaries

- `src/App.jsx`: app screens, navigation, and dialogs.
- `src/styles.css`: responsive visual system.
- `src/lib/budget.js`: seed fixtures, integer-cent calculations, and pure budget operations.
- `src/lib/store.js`: browser-local persistence adapter (`pocket.demo.v1`). Replace this boundary with authenticated server calls for shared data.
- `src/lib/budget.test.js`: budget invariants and failure-case tests.
- `scripts/`: independent Bandwidth connectivity smoke tests. These are not the app backend; see [their instructions](scripts/BANDWIDTH.md).

**This is a local demo, not a connected financial service.** The browser-only mode has no backend. The connected demo adds Nessie imports, shared file-backed state, private pairing, SMS-to-app updates and the Claude agent; production login and Supabase are not implemented. No bank payments are made. localStorage does not provide secure authorization or atomic concurrent writes; production transfer checks and idempotency must live in the shared backend.

The frontend needs no secrets and does not load the existing Bandwidth `.env` configuration. Never put server credentials in `VITE_` variables. Google Fonts are optional; local font fallbacks keep the app usable offline.

## Next steps

See [the phased build plan](pocket_build_checklist_no_expo.md). The next integration milestone is Supabase-backed reads and an authenticated, atomic transfer operation, followed by your teammate's conversational agent.
