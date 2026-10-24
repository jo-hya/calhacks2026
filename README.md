# Pocket

A simple budget app for making room for everyday life. Built with React and Vite for Cal Hacks 13.0.

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

- Responsive overview with monthly totals and category budgets.
- Category details, searchable/filterable transactions, and manual expense entry.
- Budget transfers with a review/confirmation step, validation, expiration, stale-state checks, and duplicate-action protection within the local demo.
- Adjustment history, browser-local persistence, and demo reset.
- Keyboard-accessible dialogs and mobile navigation.

The demo uses **October 2026** and a fictional user, Jamie Parker. It starts with $38 remaining in dining and $60 in shopping. Moving $20 from shopping to dining leaves $58 and $40 respectively. Total allocation and transaction spending stay unchanged.

## Demo walkthrough

1. Open Overview and select **Make room for dinner**.
2. Review a $20 transfer from Shopping to Dining. No allocation changes before confirmation.
3. Confirm the transfer. Dining shows $58 left, Shopping shows $40, and Activity records the adjustment.
4. Reload to verify persistence. Use **Reset demo** to restore the original scenario.
5. On Transactions, add an expense to see category spending and remaining amounts update.

## Implementation boundaries

- `src/App.jsx`: app screens, navigation, and dialogs.
- `src/styles.css`: responsive visual system.
- `src/lib/budget.js`: seed fixtures, integer-cent calculations, and pure budget operations.
- `src/lib/store.js`: browser-local persistence adapter (`pocket.demo.v1`). Replace this boundary with authenticated server calls for shared data.
- `src/lib/budget.test.js`: budget invariants and failure-case tests.
- `scripts/`: independent Bandwidth connectivity smoke tests. These are not the app backend; see [their instructions](scripts/BANDWIDTH.md).

**This is a local demo, not a connected financial service.** There is no login, Supabase backend, Nessie import, AI agent, or SMS-to-app integration yet. No bank payments are made. localStorage does not provide secure authorization or atomic concurrent writes; production transfer checks and idempotency must live in the shared backend.

The frontend needs no secrets and does not load the existing Bandwidth `.env` configuration. Never put server credentials in `VITE_` variables. Google Fonts are optional; local font fallbacks keep the app usable offline.

## Next steps

See [the phased build plan](pocket_build_checklist_no_expo.md). The next integration milestone is Supabase-backed reads and an authenticated, atomic transfer operation, followed by your teammate's conversational agent.
