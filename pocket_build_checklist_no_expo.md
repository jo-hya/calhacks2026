> **Latest implementation update (October 25, 2026):** The app is now named **Lila**. The SMS + Nessie rehearsal, a Claude agent, Cartesia voice, Moss memory, and an Android debug build are implemented. See the [Current status](#current-status-october-25-2026) below and [phone-demo.md](docs/phone-demo.md) / [claude-agent.md](docs/claude-agent.md) / [voice-memory.md](docs/voice-memory.md) for details. Phase checkboxes below predate this work unless marked. Supabase is still not connected.

# pocket (Lila) — Phased Build Plan & Team Handoff

**Cal Hacks 13.0 · Updated October 25, 2026 · Primary demo: forwarded dinner invitation · Notification-free core**

## Current status (October 25, 2026)

**Built and working (locally, with the demo server):**
- React/Vite app (`src/`) with Overview, Budgets, Transactions, Activity, transfer review/confirm, manual expenses, reset, and browser-only fallback (`src/lib/store.js`).
- Node server (`server/index.mjs`) that owns the shared state in `.pocket/state.json` (atomic file writes, serialized changes), serves the built app, and handles private pairing (cookie).
- **Nessie** sandbox import: 12 labeled purchases for October 2026 with stable IDs and no duplicate imports. Import fails closed on unknown categories or provider errors (`server/nessie.mjs`, `scripts/seed-nessie.mjs`).
- **Bandwidth SMS** inbound/outbound through the ngrok tunnel. Callbacks are validated and deduplicated, with replies persisted before side effects (`server/bandwidth.mjs`, `server/sms-text.mjs`).
- **Claude agent** (`server/agent.mjs`, default model `claude-opus-5-5`) answers texts and app chat with tools for budgets, transactions, budget transfers, purchases, memory, and web search. Without `ANTHROPIC_API_KEY`, a scripted responder (`server/conversation.mjs`) answers instead.
- **Voice** (`server/voice.mjs`): Cartesia speech-to-text and text-to-speech, on when `CARTESIA_API_KEY` is set.
- **Memory** (`server/memory.mjs`): saved facts plus purchases, searchable through Moss when `MOSS_PROJECT_ID`/`MOSS_PROJECT_KEY` are set, with a local word-overlap fallback. Saved memories are capped at 50 and sent in the app state, but the UI does not display them yet.
- **Android**: Capacitor debug APK (`com.pocket.budget`, app name Lila) that opens the same React app over USB (`docs/android-usb.md`).
- **Tests:** `npm test` passes 55 tests (budget logic, callbacks, agent, voice/memory, demo flow).

**Recently fixed on `voice-memory` (uncommitted at time of writing):**
- Memory index stays in step with saved data. Evicted, forgotten, reset, manual-expense, and refreshed purchases are all reconciled on every save.
- Moss setup retries; search drops removed docs and weak matches; startup removes stale Moss docs from earlier runs.
- Texts can save memories; only the app and voice can delete them.
- Client error handling for voice requests.

**Verified live (previous sessions, per [phone-demo.md](docs/phone-demo.md)):** Bandwidth outbound, real Android inbound through ngrok, live Nessie read with the expected totals, and the $55 invitation → $20 transfer flow in the browser. A real-handset receipt of the new flow still needs a test.

**Not yet verified:** Live Moss indexing and relevance thresholds, live Claude agent replies on the phone, live Cartesia voice on the Android build, and the memory fixes against real providers.

**Not built:** Supabase and any production authentication (the pairing cookie is a single-user demo gate), authenticated server-side transfers with database transactions, multi-user data, group budgets, Visa merchant suggestions, x402 payments, and final submission artifacts.

## Gaps to address before the demo

1. **Identity and authorization:** A single pairing cookie gates everything. Anyone with the link on the same server instance has full access, and the pairing token changes on every restart.
2. **Forwarded text as trusted context:** Texts can save memories and can carry an exact "yes" that approves a transfer. The app does not display memories, so a user can't see or remove a bad one. Show memories in the app, then tag provenance and confirm text-sourced facts.
3. **Real-provider verification:** The memory and agent changes need a live run with Moss, Anthropic, and Cartesia keys. The 0.3 relevance threshold is a guess until tested.
4. **Handset verification:** The new agent-driven SMS flow and the Android voice path haven't been tested on the phone.
5. **Documentation drift:** `phone-demo.md` still cites 28 tests (now 55) and the README's "Next steps" point at Supabase only. Update both when the fixes are committed.
6. **Demo reliability:** Keep the seed reset, ngrok, and Bandwidth callback URL in sync at demo time. Record a backup video of a full real-SMS run.

## Next steps

1. Commit the memory/agent fixes on `voice-memory` after reviewing the diff; open the PR against `main`.
2. Run one live pass with `MOSS_*`, `ANTHROPIC_API_KEY`, and `CARTESIA_API_KEY` set: check recall quality, the 0.3 threshold, and a forwarded-invitation text end to end.
3. Test the full SMS flow on the Android phone from a clean reset, including `CANCEL`, duplicate delivery, and an expired `YES <code>`.
4. Decide whether text-sourced memories need confirmation before they reach future replies.
5. If Supabase is still in scope for the prize story, start the schema and authenticated transfer work (Phase 2–3 below); otherwise document the file-backed state as the demo boundary.
6. Update this checklist and `phone-demo.md` with the verified results, then prepare the backup recording and the architecture slide.

## Tech stack and architecture

- **Frontend:** React 19 + Vite 6, plain CSS (`src/styles.css`), wrapped in a Capacitor 8 Android shell. Browser-local demo mode when no server is present.
- **Server:** Node 22.18+ ESM (`server/`), no framework. Plain `http` server, file-backed state, single process with a serialized work queue.
- **Money and budgets:** Integer cents in pure functions (`src/lib/budget.js`) shared by the browser and server.
- **External services:** Capital One **Nessie** (purchase data, sandbox), **Bandwidth** (SMS via a Build application, webhook through **ngrok**), **Anthropic** Claude (agent with tool use and server-side web search), **Cartesia** (Ink STT, Sonic TTS), **Moss** (semantic memory search).
- **Data flow:** Nessie → import → saved state → budget math → agent tools. SMS/app/voice → `server/index.mjs` → agent → proposal → explicit approval → budget change in saved state → memory index sync.
- **Safety model:** Proposals are server-owned with expiry and state checks; transfers only change category allocations, never bank money; approvals must match a live proposal code; SMS callbacks are deduplicated.
- **Tests:** Node's built-in `node --test` (`npm test`).

---

## Original plan (predates the Lila/Claude work; retained for reference)

**Cal Hacks 13.0 · Originally October 24, 2026 · Primary demo: forwarded dinner invitation · Notification-free core**

> **Product vision:** Pocket helps college students and recent graduates make informed spending decisions **before** they buy. The intended connected experience lets a user forward an ordinary text about plans, ask financial questions, and—with explicit confirmation—adjust a budget grounded in app data. The basic app now works with local demo data; the connected SMS experience is still future work.
>
> **Current implementation:** A new React/Vite app provides budgets, transactions, manual expenses, confirmed local budget transfers, activity history, and demo reset. The pre-existing Bandwidth scripts are independent connectivity smoke tests, not the product backend. Earlier real-SMS success is reported; the local callback tests were rerun successfully during review. Supabase, Nessie, and the conversational agent are not integrated into the app yet.

## Important scope decisions

- **Primary experience:** User-initiated, natural-language SMS conversation grounded in their Pocket financial data.
- **Primary demo:** Forward/copy a friend's dinner invitation → ask whether it's affordable → discuss options → approve a budget adjustment → see the updated balances in the app.
- **Not a core feature anymore:** Push notifications, always-on location tracking, proximity-triggered alerts, and geofencing. **Do not spend core build time on notification infrastructure.**
- **Frontend technology:** The basic app has now been built from scratch with **React and Vite**. Extend this responsive web interface; no Expo or mobile framework migration is needed.
- **Agent ownership:** Your teammate builds the conversational Claude/Fetch.ai agent and connects it to Bandwidth. **You are not implementing the agent or the SMS-to-agent wiring.**
- **Shared responsibility:** You and your teammate agree on the financial-data/tool contract and verify one complete flow together.
- **Execution priority:** Follow the phase gates below. P0 means required for the core demo; full transaction filtering, extensive category pages, automatic refresh, and optional prize features must not block it.
- **Financial language:** Describe whether a purchase fits the available category allocation. A category budget alone does not establish overall financial affordability.

## Phased execution plan

**Critical sequence:** contract → coherent data → safe transfer → visible frontend result → real SMS integration → rehearsal.

**Baseline clarified by the user (October 24, 2026):** The product started from scratch. The original `scripts/` files only tested whether Bandwidth could work. They are not the application's architecture and should remain independent of the frontend.

### Basic app milestone — implemented locally

- [x] React/Vite app with responsive Overview, Budgets, Transactions, and Activity screens.
- [x] Fictional October demo user with transaction-derived balances: $38 dining / $60 shopping remaining.
- [x] Category detail dialogs, merchant search, category filters, and manual expense entry.
- [x] Transfer review and confirmation, amount/category validation, stale/expired proposal rejection, and duplicate-confirmation protection in the local demo logic.
- [x] Browser-local persistence, adjustment history, and reset to the dinner scenario.
- [x] Budget logic tests and production build; independent Bandwidth callback tests retained.
- [x] Browser verification: desktop/mobile transfer, cancel, persistence, transaction search/filtering, expense entry, category details, and reset. All four screens fit 390px, 768px, and 1440px widths without horizontal overflow; no browser console errors observed.
- [ ] Shared authenticated data, real account identity, Supabase migrations/RLS, atomic server transfers, Nessie imports, and SMS/agent integration.

**Current boundary:** `src/lib/budget.js` contains pure calculations and demo operations; `src/lib/store.js` is the replaceable local persistence adapter. localStorage is not an authorization system or an atomic shared database. Local confirmation behavior does not complete the server-side safety requirements in Phase 3.

**Next build order:** Agree on the agent/data contract → add Supabase and demo-user authentication → implement server-side transfer proposal/confirmation → replace the local adapter and verify the existing UI → integrate the teammate's agent. Phase 4's visual foundation is already built; its shared-backend acceptance gate remains open.

### Phase 1 — Establish the baseline and agree on the contract

**Owner:** You, with your teammate for interface and identity decisions. **Dependency:** None.

- [x] Review the original checkout: `scripts/` contains only Bandwidth smoke tests; the user confirmed there was no existing product app to locate.
- [x] Create and document the basic React/Vite app. Start it with `npm run dev`; see the README for the current implementation boundaries.
- [ ] Maintain an implementation-status log distinguishing **working locally / implemented but untested / connected and verified / not yet built**. Do not count local fixtures as live integrations.
- [ ] Agree on the canonical demo user, verified SMS sender mapping, budget period, currency, category identifiers, and authenticated access model.
- [ ] Start `docs/agent-integration-contract.md` with actual routes/functions, request/response examples, money units, error codes, and ownership. Identify proposed interfaces explicitly until implemented.
- [ ] Assign the shared backend ownership of immutable transfer proposals, expiration, cancellation, and execution state. Your teammate owns conversation context and collecting explicit approval tied to a proposal ID.
- [ ] Define how approval reaches the authenticated backend, how stale financial state invalidates a proposal, and how the frontend reloads agent-initiated changes.

**Completion gate:** Both sides can implement against documented interfaces and fixtures without guessing. Your teammate can begin the conversation integration against those fixtures while you complete Phases 2–4.

### Phase 2 — Build a deterministic financial foundation

**Owner:** You. **Dependency:** Phase 1 identity and data contract.

- [ ] Create the Supabase schema and migrations: user-scoped category budgets, categorized transactions, transfer proposals, and adjustment history. There is no Supabase implementation in the current app yet.
- [ ] Add an authenticated demo identity and map it to the agreed agent user. The current fictional browser-local profile is display data, not authentication.
- [ ] Store money in integer cents. Derive period spending from a documented set of transactions and calculate `remaining = allocation − spent` consistently for the frontend and agent.
- [ ] Define period boundaries and treatment of pending transactions, refunds, and excluded records so imports and UI totals agree.
- [ ] Seed dining at **$120 allocated / $82 spent / $38 remaining** and shopping at **$150 allocated / $90 spent / $60 remaining**.
- [ ] Add a repeatable demo reset that restores these figures and clears demo proposals/adjustments without touching unrelated users.
- [ ] Enforce user-scoped reads and row-level security; keep service credentials server-side.
- [ ] Establish a transaction import boundary with stable external IDs for deduplication. Connect Nessie if available; otherwise use clearly labeled deterministic fixtures behind the same interface and track the live integration separately.

**Completion gate:** The financial read interface reliably returns $38 dining remaining and $60 shopping remaining. Resetting restores those exact values, supported by the seeded transaction records.

### Phase 3 — Implement the safe budget action

**Owner:** You/shared backend owner agreed in Phase 1. **Dependency:** Phase 2 financial model.

- [ ] Implement proposal creation: authorize the user; validate categories, period, currency, and a positive integer-cent amount; record the exact action, expiration, and relevant financial-state versions. Do not change allocations.
- [ ] Implement confirmation through the authenticated agent integration, with approval evidence tied to the exact proposal and user. Possession of a proposal ID alone is not proof of approval.
- [ ] In one database transaction, check proposal state and current financial state, validate transferable allocation, update both category limits, mark the proposal executed, and write the audit entry.
- [ ] Make duplicate confirmation return the original result without another transfer. Ensure concurrent confirmations cannot apply the same action twice or overspend the source allocation.
- [ ] Reject expired, canceled, unauthorized, or stale proposals. Relevant transaction changes as well as allocation changes must invalidate outdated calculations. Require a fresh proposal and approval after material changes.
- [ ] Test success, zero/negative/non-integer amounts, same-category transfers, insufficient allocation, unauthorized access, stale/expired/canceled proposals, duplicate confirmation, and concurrent attempts.

**Completion gate:** A direct backend call changes remaining balances to **$58 dining / $40 shopping**, preserves total allocation and spending, and creates exactly one adjustment entry. No bank transaction is created.

### Phase 4 — Complete the smallest useful frontend

**Owner:** You. **Dependency:** Phase 2 reads and Phase 3 action; UI wiring can begin while the action is built.

- [x] Build the basic React/Vite interface around a shared local financial read model and fictional demo user.
- [ ] Replace the local adapter with authenticated shared-backend reads and mutations. Add loading, backend-error, and refresh/revalidation behavior at this boundary.
- [ ] Prioritize the judging screen: dining/shopping allocation, spent, remaining, representative transactions, and recent confirmed adjustments.
- [ ] Add clear loading, empty, and error states plus a dependable manual refresh action. Automatic revalidation is optional after the first successful integration.
- [ ] Verify the actual browser/device can reach the backend and that budget changes are readable during the presentation.
- [ ] Make a transfer directly through the backend, then refresh and verify the new values and adjustment history without running the agent.
- [ ] Defer extensive category pages and transaction filters until the core flow is reliable.

**Completion gate:** The frontend visibly proves the backend action worked, with $58 dining / $40 shopping remaining and one history entry, using live data rather than hardcoded balances. This is the first major integration milestone.

### Phase 5 — Integrate with your teammate and rehearse failure cases

**Owner:** Shared; your teammate retains Claude/Fetch.ai, conversation, and Bandwidth ownership. **Dependency:** Phases 3–4 and teammate's agent wiring.

- [ ] Reset the demo and run the full flow on the actual Android phone: forward the $55 invitation → identify the $17 category shortfall → request $20 from shopping → propose → approve → verify SMS, database, and dashboard.
- [ ] Verify no allocation changes before approval and exactly one change afterward.
- [ ] Test cancellation, changing the proposed amount, duplicate message delivery, expired/stale approval, and backend/provider failure.
- [ ] Test database success followed by SMS delivery failure: retrying must recover the committed result without transferring another $20.
- [ ] Ensure the agent describes what the budget data supports, does not fabricate unavailable figures, and treats the quoted invitation as context rather than action authorization.
- [ ] Repeat the complete flow from a clean reset and record any remaining failures with an owner.

**Completion gate:** The real-phone flow works repeatedly from a clean reset, and failure cases do not create unintended budget changes.

### Phase 6 — Package the demo and submission

**Owner:** You, with teammate review of agent startup and architecture details. **Dependency:** Phase 5 for final rehearsal and recording; documentation can develop earlier.

- [ ] Finish the seed/reset command, startup instructions, implementation-status log, README, and concise architecture slide.
- [ ] Document frontend/backend configuration, ngrok and Bandwidth callback setup, required environment variable names, and which components are live, sandbox-backed, or fixtures. Do not include secrets or actual phone numbers.
- [ ] Rehearse a 60–90-second presentation and record a complete successful real-SMS backup.
- [ ] Verify current prize eligibility, deadlines, and submission requirements against organizer materials before preparing prize-specific assets. Requirements listed later in this document remain unverified planning notes until checked.
- [ ] Have another teammate start the system, reset it, and reproduce the demo using the documentation.

**Completion gate:** The demo is reproducible by another teammate, the backup recording exists, and applicable submission materials are ready.

### Phase 7 — Add one extension after the core demo is reliable

**Owner:** Assign based on the selected feature. **Dependency:** Phase 6 completion and enough time to validate the extension.

- [ ] Prefer on-demand cheaper dinner alternatives as the first extension because they continue the same user journey. Use verified merchant information or clearly labeled demo suggestions.
- [ ] Choose at most one extension based on user value and a confirmed submission target. Social budgets, voice, and payments each need additional state, permissions, and integration work.
- [ ] Define a small acceptance test before implementation and rerun the core dinner demo after integration.
- [ ] Keep notifications, geofencing, background location, and unrelated feature expansion outside core scope.

**Completion gate:** The selected extension works end to end, supports the product story, and leaves the core demo reliable. If time is insufficient, ship the completed core flow.

---

## Ownership and division of work

### You — frontend, financial data, product, integration handoff

- [x] Build the basic local Pocket interface: dashboard, budgets, category breakdowns, transactions, and budget-adjustment activity.
- [ ] Connect and verify those screens against the shared financial backend.
- [ ] Connect the frontend to **Supabase** as the shared source of truth; use a coherent seeded demo user.
- [ ] Integrate or display **Capital One Nessie** transaction data, with a documented deterministic mock fallback if necessary.
- [ ] Implement/test budget calculations and the **safe backend operation** that reallocates budget limits between categories.
- [ ] Provide your teammate with documented read/write interfaces, user mapping, and example responses—without exposing server credentials.
- [ ] Own Figma/design assets, product story, demonstration fixtures, README contributions, and submission preparation.
- [ ] Do **not** write Claude prompts, agent orchestration, conversational state, or Bandwidth SMS response logic unless your teammate explicitly hands off part of that work.

### Teammate — conversational agent and Bandwidth

- [ ] Connect the Claude/Fetch.ai agent to the already-working Bandwidth inbound/outbound SMS path.
- [ ] Accept **arbitrary natural-language input**, including pasted/forwarded messages and multi-turn follow-ups; `ALT` and `KEEP` are optional shortcuts, not the interface.
- [ ] Maintain conversation context, identify user intent, query approved financial tools, generate grounded responses, and clarify ambiguities.
- [ ] Handle explicit approval before writing a budget change; ensure a confirmation is tied to exactly one pending action.
- [ ] Send reply SMS, map verified sender to the right app user, handle retries, and prevent duplicate responses/actions.
- [ ] Handle unavailable data, off-topic requests, provider failures, and unsupported actions gracefully.

### Shared deliverables

- [ ] One canonical demo user ID mapped securely to the verified Android SMS sender.
- [ ] A stable backend/API contract for fetching financial context and performing approved budget transfers.
- [ ] A cross-component integration test and a reproducible end-to-end live demo.
- [ ] A clear implementation-status log: **working / implemented but untested / not yet built**.

---

## P0 — Main demo: forward a friend's dinner invitation

### User journey (the flow we're building around)

1. A friend texts: **“Dinner tonight? The new place is about $55 per person.”**
2. The user **copies or forwards** that text to the Pocket SMS conversation: **“Can I afford this?”** Do not claim Pocket can automatically read unrelated private conversations.
3. The agent retrieves the user's **current dining budget and relevant transaction history**, rather than asking the user to re-enter their finances. Merchant alternatives are an optional Phase 7 extension.
4. Seeded example: **$38 remains in dining**. The agent explains that a $55 dinner is **$17 over the category's remaining allocation**.
5. User asks naturally: **“I still want to go. Can I move $20 from shopping?”**
6. The agent checks shopping's available amount and proposes the transfer without changing anything yet.
7. The agent asks: **“Move $20 from shopping to dining?”** User replies: **“Yes, do it.”**
8. The shared backend applies **one confirmed budget allocation change**. Assuming no other transactions, dining remaining becomes **$58**; shopping remaining decreases by **$20**.
9. The agent replies with a confirmation. The user refreshes or views the frontend, which now shows the updated category budgets and an adjustment history entry.

### Your implementation checklist

- [ ] Seed a stable user with **$38 dining remaining** and **$60 shopping remaining**.
- [ ] Show live category `limit`, `spent`, and `remaining` values from the canonical data source.
- [ ] Implement the safe budget-reallocation backend operation and audit record (or coordinate implementation ownership if your teammate is writing the endpoint).
- [ ] Ensure transfers modify **category allocations**, not bank transactions or actual cash transfers.
- [ ] Make the frontend show the confirmed updated balances and adjustment history after refresh/revalidation.
- [ ] Provide the teammate with budget lookup and transfer test fixtures; document realistic failure cases.
- [ ] Test the UI with a budget update made directly through the agreed backend before the AI agent is connected.
- [ ] Make demo values, backend values, and the SMS script mathematically consistent.

### Teammate dependency (track; do not implement)

- [ ] Interpret the quoted invite as **context**, not as an instruction to transfer money.
- [ ] Understand follow-ups such as “What if I use shopping?”, “Actually, only $10,” “Never mind,” or “Yes, do it.”
- [ ] Read the correct live user budgets before answering and before executing any transfer.
- [ ] Ask confirmation for a specific amount/from/to transfer, then execute it once.
- [ ] Send a natural SMS answer and maintain context across messages.

**Acceptance test:** On the actual Android phone, a forwarded invitation leads to an accurate answer; a follow-up requests a $20 reallocation; explicit approval updates the database **and the visible dashboard**, and the agent confirms the change.

---

## P0 — Financial data and backend (your highest-leverage work)

### Supabase

- [ ] Inspect existing schema and code; don't rebuild working functionality.
- [ ] Define/stabilize records for users, budgets, transactions, and budget adjustments. Use real existing table names in code; proposed names below are not schema claims.
- [ ] Ensure every budget and transaction belongs to a stable `user_id`.
- [ ] Store money in integer cents; derive period spending from the agreed transaction set and `remaining = allocation − spent` in the shared read model.
- [ ] Enforce row-level security for client-facing user data.
- [ ] Keep admin/service-role credentials **server-side** and out of the client and repo.
- [ ] Provide a seed/reset script that recreates the demo figures reproducibly.
- [ ] Implement an atomic, validated, idempotent budget transfer with an audit trail. Reject zero/negative/non-integer-cent amounts, same-category transfers, insufficient transferable allocation, expired/canceled/stale confirmations, and unauthorized access.
- [ ] Refresh/revalidate data after a transfer so the frontend displays updated numbers promptly.

### Capital One Nessie and transaction logic

- [ ] Verify Nessie account and transaction data mapping (merchant, amount, date, category, user).
- [ ] Import or query realistic transaction history without creating duplicates.
- [ ] Categorize transactions for dining, shopping, groceries, and other relevant categories.
- [ ] Confirm sample balances are calculated from actual seeded budget/transaction values.
- [ ] Provide a clearly identified deterministic fallback if the sandbox is unstable during the live demo.
- [ ] Distinguish **mock banking data**, **budget reallocation**, and **real payments** in both UI and documentation.

### Proposed shared data structures

| Record / capability | Minimum useful information | Ownership |
| --- | --- | --- |
| User profile | `user_id`, authorized phone mapping, preferences | Shared backend |
| Budget | user, category, period, limit, spent, remaining | Your data layer |
| Transaction | external ID, user, merchant, amount, date, category | Your data layer |
| Budget adjustment | action ID, user, from/to category, amount, confirmation, timestamp | Shared validated backend |
| Transfer proposal | user, immutable from/to/amount/period, expiration, financial-state versions, status, approval reference | Shared validated backend |
| Conversation | user, conversation context, current proposal ID, approval message reference | Teammate |

---

## P0 — Agent integration contract (provide, don't build agent)

**Write `docs/agent-integration-contract.md` with the actual routes or server functions, not just these examples.** Decide with your teammate who implements the shared backend wrappers.

| Tool / operation (suggested name) | Purpose | Safety requirement |
| --- | --- | --- |
| `get_user_financial_context(user_id)` | Retrieve category budgets and recent categorized transactions | Authorized user only; read-only |
| `get_budget(user_id, category)` | Retrieve current category allocation and remaining amount | Correct period and source of truth |
| `get_recent_transactions(user_id, filters)` | Ground explanations in transaction history | Limit exposure and avoid duplicate records |
| `propose_budget_transfer(user_id, from, to, amount)` | Validate the requested reallocation without applying it | Return a specific pending-action ID and expected results |
| `confirm_budget_transfer(user_id, pending_action_id, approval_reference)` | Apply an explicitly approved action | Authenticated approval bound to user/proposal; atomic, single-use, idempotent |
| `cancel_budget_transfer(user_id, pending_action_id)` | Invalidate a pending proposal | Authorized user only; canceled proposals cannot execute |
| `list_budget_adjustments(user_id)` | Show visible proof of a confirmed change | User-scoped read access |

### Example response to agent (illustrative only)

```json
{
  "user_id": "demo-user-1",
  "budget_period": "2026-10",
  "currency": "USD",
  "categories": [
    {"category": "dining", "limit_cents": 12000, "spent_cents": 8200, "remaining_cents": 3800},
    {"category": "shopping", "limit_cents": 15000, "spent_cents": 9000, "remaining_cents": 6000}
  ]
}
```

After **confirmed** $20 shopping → dining reallocation, category limits change; the dining remaining amount becomes **$58** and shopping remaining becomes **$40**, assuming spent amounts do not change. **Do not create a fake bank payment.**

### Integration questions to settle with your teammate

- [ ] How does the Bandwidth inbound sender map to the same `user_id` as the frontend?
- [ ] Which actual endpoint/function returns current budgets and transaction summaries?
- [ ] Who implements the validated budget transfer, and how is user approval represented?
- [ ] How does the frontend detect/reload agent-initiated changes?
- [ ] What happens if the agent proposes a transfer using outdated budget information?
- [ ] What errors should tools return for an unknown user, insufficient budget, expired approval, or provider failure?
- [ ] How do we keep sensitive tokens, actual phone numbers, and service keys out of demo artifacts and Git?
- [ ] Who keeps the live ngrok tunnel and Bandwidth callback URL correct for demo time?

**Handoff definition of done:** Your teammate can call the agreed tools to fetch a demo user's real budget, request an approved transfer, and see the correct result in the same frontend you demo.

---

## Frontend scope — P0 demo screen, P1 expanded browsing

> The React/Vite frontend now works with browser-local demo data. Keep it and replace the persistence boundary when connecting Supabase. Local UI functionality is implemented; shared-backend acceptance below is still pending.

- [ ] Budget dashboard: total budget, category breakdown, spent, remaining, and spending progress.
- [ ] P0: Show category allocations, representative transactions, and recent adjustments on the demo screen. Separate category detail pages are P1.
- [ ] P0: Show transaction merchant, amount, date, and category. Full history browsing and filters are P1.
- [ ] Recent activity: confirmed transfers and their effects on category limits.
- [ ] Clear loading, empty, error, and demo reset states.
- [ ] Ensure the visible user matches the user associated with the test SMS sender.
- [ ] Verify the browser/device can access backend URLs; avoid pointing a physical phone to laptop-local `localhost`.
- [ ] Make the demo visually polished enough to read budget changes at a glance.
- [ ] Test the actual presentation setup (laptop/browser or phone, whichever you plan to show).

**Acceptance:** Without running the language model, a teammate can change the demo user's budget via the shared backend and your frontend shows the correct result on refresh.

---

## P0 — Full integration tests (you + teammate)

| Test | Expected behavior | Main owner |
| --- | --- | --- |
| Baseline SMS | Real Android inbound webhook arrives through Bandwidth → ngrok | Teammate (already demonstrated at webhook level) |
| Free-form question | Agent answers “How much can I spend on dinner?” using real data | Teammate + your tools |
| Forwarded $55 invitation | Correctly compares $55 against $38 dining remaining; reports $17 shortfall | Shared |
| Clarification / follow-up | Understands “Can I move $20 from shopping?” without restarting context | Teammate |
| Transfer proposal | Shows validated $20 shopping → dining proposal; no write yet | Shared |
| Confirmation | “Yes, do it” applies **exactly one** change | Shared |
| UI verification | Dining remaining $58 and shopping remaining $40, reflected in frontend | You |
| Cancellation | “Never mind” results in no write | Teammate |
| Duplicate incoming SMS | No repeated transfer or duplicate actions | Teammate + shared backend |
| Changed amount | Old proposal cannot execute; replacement requires fresh approval | Shared |
| Expired/stale approval | No write; fresh proposal and approval required | Shared |
| Concurrent confirmation | One committed action and one audit entry | Shared backend |
| SMS failure after commit | Retry returns committed result without another transfer | Shared |
| Unrecognized / off-topic text | Helpful, safe clarification or honest limitation | Teammate |
| Backend/provider outage | Useful error, no fabricated financial numbers, recoverable demo | Shared |

---

## P1 — Additional capabilities aligned to the prize goals

These support the broader Pocket vision but **must not delay the core dinner-invite SMS flow**.

### Social/group budgets — Meta

- [ ] Allow friends to opt in to a shared dining or outing budget.
- [ ] Let a group plan an affordable dinner and track shared spending against a goal.
- [ ] Keep individual personal budgets private unless explicitly shared.
- [ ] Let users record a short encouraging audio message for friends, with clear consent and playback controls.
- [ ] Explore contextual encouragement within the app or conversation, **not dependent on automatic push notifications**.

### Merchant suggestions and shopping — Visa

- [ ] Add an **on-demand** question such as “What could we eat near campus for less than $20?”
- [ ] Return verified or clearly marked demo merchant suggestions; disclose unavailable live prices.
- [ ] Explain affordability in terms of the user's remaining budget, not generic spending advice.

### Voice — Cartesia

- [ ] If targeting Cartesia, build a meaningful spoken financial interaction or friend-voice experience instead of a decorative voice sample.
- [ ] Preserve transcript/context and protect any recorded voice or likeness with explicit consent.
- [ ] Document voice contribution, limitations, and the requested demo/README artifacts.

### Agentic payments — Coinbase x402 (stretch)

- [ ] Explore approved payment flows **only after** the budget demo is reliable.
- [ ] Require explicit authorization immediately before each transaction; display amount, recipient, and fees.
- [ ] Use sandbox/demo rails where possible; never equate a budget allocation change with real payment.

### Optional location awareness (not core, no notification requirement)

- [ ] If time remains, allow the user to **ask** Pocket about nearby affordable merchants or manually select a location.
- [ ] A spending heatmap may be added later if grounded location/transaction data is available and privacy controls are appropriate.
- [ ] Defer automatic location monitoring, geofencing, and background notification delivery unless deliberately reprioritized.

### Prize / submission mapping

These are planning targets, not verified eligibility or current organizer requirements. Confirm them during Phase 6 before claiming a prize integration or preparing specific assets.

| Prize | Pocket angle | Relative priority |
| --- | --- | --- |
| Anthropic | Claude reasons over real user budget data and natural-language social plans | P0 agent story |
| Microsoft finance agent / customer impact | Complete useful finance flow with safe, auditable decisions | P0 |
| Fetch.ai | Actual agent orchestration of financial tools and approved actions | Teammate P0 |
| Capital One Nessie | Transaction-backed budgets and responsible presentation of mock financial data | Your P0 |
| Visa | On-demand affordable alternatives before purchase | P1 |
| Meta | Opt-in social budgets and supportive recorded messages | P1 |
| Cartesia | Voice-forward interaction with tangible user benefit | P1 |
| Coinbase x402 | Permission-gated commerce/payment agent | Stretch |
| Figma | Design workflow, prototype, Slides, stage log, appropriate submission assets | P1 / submission |

---

## P0 — Demo and submission preparation

- [ ] Rehearse the main dinner flow on the actual phone and frontend used for judging.
- [ ] Prepare a **60–90-second demo**: friend invitation → forward to Pocket → personalized financial response → approval → visible app update.
- [ ] Record a backup video of a complete **real SMS** interaction.
- [ ] Provide a reproducible seed/reset process and startup instructions for the backend and ngrok.
- [ ] Write a README covering target users, problem, product, architecture, setup, technical stack, sample flow, limitations, and privacy/safety.
- [ ] Make a clear architecture slide separating **frontend/Supabase/Nessie** from **Claude/Fetch.ai/Bandwidth**.
- [ ] Document which parts are real, sandbox-backed, and demo fixtures.
- [ ] Confirm current prize deadlines, eligibility, and submission materials from organizers.
- [ ] If submitting to Figma, verify the listed planning requirements (demo video up to 3 minutes, stage log up to 200 words per stage, Figma Slides, and applicable prototypes/files) against current organizer materials, then prepare the confirmed assets.
- [ ] If submitting to Cartesia, verify the listed planning requirements (2-minute demo-first presentation, README, and source access), then prepare the confirmed assets only if voice is integrated.

---

## Build coordination

Use the phased execution plan above as the authoritative build order. The domain checklists provide supporting detail, not additional work that must all happen before the first demo.

Your teammate can build conversation behavior against the Phase 1 fixtures while you complete data, transfer logic, and frontend integration. First prove **backend → frontend** without the agent; then prove **SMS → agent → backend → frontend** together. Keep optional browsing, live merchant suggestions, and prize extensions behind the core demo completion gates.

## Minimum viable demo checklist

- [ ] Pocket frontend shows coherent, accurate budget and transaction data for the demo user.
- [ ] User can forward/copy a friend's $55 dinner invite to Pocket over SMS.
- [ ] Teammate's agent uses stored data to calculate whether the invite fits the remaining $38 dining budget.
- [ ] Natural-language follow-up requests a $20 shopping → dining budget transfer.
- [ ] Agent asks explicit approval, and the backend applies exactly one validated change.
- [ ] The frontend shows dining remaining $58 and shopping remaining $40.
- [ ] Successful end-to-end flow is reproducible and captured on a backup video.

## Known versus not yet verified

**Previously reported live verification:** Bandwidth outbound SMS, real Android inbound webhook via ngrok, and 204 simulated callbacks. No real SMS was sent during the app build.

**Verified during local development:** The 12 budget logic tests and nine callback subtests pass (Node reports 22 including the callback parent test). The React/Vite production build succeeds. Desktop/mobile browser checks cover transfer review/cancel/confirm, correct balances, reload persistence, activity history, merchant search, category filtering, empty results, expense recalculation, insufficient-budget errors, dialog dismissal, and reset. All four screens were checked at 390px, 768px, and 1440px with no horizontal overflow. No browser console errors were observed. See the README for local startup and demo steps.

**Not connected/built in this app yet:** Data-driven conversational agent replies, Supabase integration, Nessie transaction imports, authenticated server-side budget transfers, SMS-to-dashboard updates, group budgets, voice, payments, and final submission artifacts.

**Final division of responsibilities:** **You: frontend, Supabase/Nessie, budget logic, tool handoff, demo.** **Teammate: Claude/Fetch.ai agent, conversation memory, Bandwidth connection, natural-language SMS replies.** Automatic notifications and geofencing are **out of core scope**.
