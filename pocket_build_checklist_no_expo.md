# Pocket / Lila - Build Checklist and Team Handoff

**Reviewed October 24, 2026 against the current checkout.** The product is now branded **Lila**; this filename and internal `pocket` identifiers remain for continuity.

## Current stage

**We are in Phase 5: integration validation and real-phone rehearsal, with Phase 6 demo packaging next.** The frontend, shared demo backend, Nessie importer, Bandwidth webhook, and Claude agent are implemented. This is beyond the original browser-only prototype. It is a single-user connected hackathon demo, not yet a production multi-user app.

The original plan assumed Supabase would precede integration. The implemented demo instead uses one Node process, serialized mutations, and file-backed state. That enables the connected demo now; it does not complete the original Supabase/authentication/database-transaction requirements. Production hardening remains a separate unfinished milestone.

**Immediate gate for the existing demo:** prove the current Claude -> real SMS -> shared budget -> actual phone UI flow repeatedly, close the approval gaps below, and capture a backup recording. Do not mark the core demo complete based only on mocked tests or the older scripted browser rehearsal.

## Product direction clarified after the implementation review

The user has now expanded the intended MVP beyond the dinner-transfer demo. The phase status above describes existing code, not completion of this expanded scope.

- **Promise:** Lila is a proactive, conversational budgeting assistant that learns from spending and preferences and helps people enjoy their money with less manual work.
- **Conversation:** private SMS is the primary conversation surface. The app provides onboarding, personalized recommendations, financial controls, and group planning; an in-app chatbot is not a priority.
- **Three paths:** when a plan exceeds a category allocation, explain options to move available discretionary budget with approval, find a similar cheaper alternative, or skip spending / suggest a free activity. Do not invent transferable funds or shame the user.
- **Proactive location:** the user explicitly wants texts while the app is closed. Native background location is now a product requirement, superseding earlier out-of-scope wording. The current foreground implementation does not meet it.
- **Design authority:** only the Figma Codex page; frames ending in `- Final` supersede older screens. Adapt other screens to the same visual direction. Do not treat other Figma pages as requirements.
- **Transactions:** allow edits to any transaction and addition of missing purchases. Preserve original imported records and user overrides separately so subsequent sync does not erase corrections. A visit alone must not become a confirmed expense.
- **Groups:** people privately contribute outing preferences and spending comfort limits; Lila proposes activities without exposing individual finances. No group implementation exists yet.
- **Onboarding:** budgets, preferences, data-source selection, phone setup, and location consent are missing product flows and are required to make the app usable beyond the preset profile.
- **Delivery target:** roughly 12 hours, one Android presentation phone. Real group SMS participation versus forwarding to private Lila SMS, and friend participation through web links versus SMS, remain open decisions.

## Evidence and status conventions

- `[x]` means the named implementation or check exists; it does not imply live provider or handset verification unless explicitly stated.
- `[ ]` means unfinished or not verified with available evidence.
- **Verified in this review:** `npm test` passes (44 tests reported by Node, including nested/parent tests); `npm run build` passes.
- **Previously documented verification:** [phone-demo.md](docs/phone-demo.md) records live Nessie reads of 12 purchases, public HTTPS pairing/state reads, and a 390px scripted browser rehearsal ending at $58 Dining / $40 Clothing. These were not rerun in this review.
- **Implemented, live verification still open:** Claude responses with the configured model/key, the complete current handset SMS exchange, live ALT sandbox purchases, location-triggered SMS, and the current APK on the presentation phone.
- An Android debug APK exists locally. Its presence alone does not prove a fresh native build or successful installation; neither was performed in this review.
- This review did not send SMS, call paid model APIs, reseed Nessie, reset shared data, or change provider settings.

## Phase 1 - App baseline and integration contract: mostly implemented

- [x] React/Vite frontend, now branded Lila, with Home, Budgets, Activity, Profile, quick actions, and transaction browsing.
- [x] Separate browser-only mode (`npm run dev`) from connected mode (`npm run build`, then `npm run demo`). Browser-only data stays in localStorage; connected mode calls the shared server.
- [x] Implement actual interfaces in `server/index.mjs`: `GET /api/state`; JSON POSTs to `/api/sync`, `/api/message`, `/api/proposal`, `/api/transfer`, `/api/expense`, `/api/reset`, and `/api/location`.
- [x] Private pairing link installs a cookie; the webhook checks its token, configured sender, recipient, and application.
- [x] Document setup in [phone-demo.md](docs/phone-demo.md), [claude-agent.md](docs/claude-agent.md), and [android-usb.md](docs/android-usb.md).
- [ ] Consolidate the final agent/data contract with request/response examples, money units, error behavior, approval semantics, and ownership. `docs/agent-integration-contract.md` does not yet exist.
- [ ] Reconcile older README and setup wording with the current Claude implementation and the two distinct command modes below.

**Boundary:** pairing authorizes access to one shared demo profile. It is not production login or a multi-user identity model. Internal monetary state uses integer cents; Claude proposal tools accept dollars and convert them.

## Phase 2 - Financial foundation: connected demo implemented

- [x] Derive category spending and remaining amounts from transactions using integer cents.
- [x] Seed the October 2026 dinner scenario: Dining $120 allocated / $82 spent / $38 remaining; Clothing $150 allocated / $90 spent / $60 remaining. Clothing retains internal category ID `shopping`.
- [x] Import Nessie sandbox purchases with stable external IDs; restrict imports to the supported period/statuses, retain manual entries, and surface category/import errors.
- [x] Provide repeatable labeled sandbox seeding (`npm run nessie:seed`) and shared demo reset.
- [x] Persist shared state in ignored `.pocket/` files and serialize mutations within one Node process.
- [x] Refresh Nessie before message handling and transfer confirmation; show a warning on refresh failure and block approvals that require fresh data.
- [ ] Implement Supabase schema/migrations, authenticated user mapping, RLS, and durable database transactions if proceeding beyond the single-user demo.

**Reset distinction:** seed setup preserves unrelated purchases. Connected reset also deletes agent-created Nessie sandbox purchases. Inspect any uncertain payment outcome before resetting; reset is not simply clearing browser storage.

**Acceptance baseline:** Dining $38 and Clothing $60 remaining. A $20 allocation move yields $58 / $40 without changing spending or creating a bank payment.

## Phase 3 - Safe actions: demo safeguards implemented; gaps remain

- [x] Local/UI/scripted transfer proposals validate amount and categories, preserve state revision, expire, and reject stale confirmation.
- [x] Duplicate transfer confirmation is idempotent in budget logic; confirmed transfers preserve total allocation and record activity.
- [x] Claude can propose transfers and sandbox purchases, read budgets/transactions, and cancel a pending action.
- [x] Claude tool guards require a later user-initiated exact `YES`, the pending action captured at turn start, and a successful Nessie refresh. Forwarded text and location updates cannot themselves approve actions.
- [x] Persist payment attempts before Nessie submission; uncertain attempts reconcile against Nessie after restart without submitting another purchase. Automated coverage exists.
- [x] Persist callback IDs/outbound status and test duplicate callbacks, provider failures, and budget commits surviving outbound failure.
- [ ] **Close the Claude stale-proposal gap:** `setPending` validates a transfer but discards that validation proposal; `applyPending` creates a new proposal against current state. Available funds are rechecked, but a changed financial revision does not necessarily force fresh user approval. Preserve the original relevant revision and test intervening purchases/allocation changes.
- [ ] Verify/isolate pending actions across browser and SMS in Claude mode. The scripted responder uses channel-specific proposals; Claude currently shares one pending action and conversation history.
- [ ] Add targeted coverage for overlapping Claude turns/confirmations and restart boundaries between action commit, inbox completion, and reply queuing. Existing callback tests do not prove every crash window or concurrent agent interaction.
- [ ] For production, replace process-local serialization/file replacement with authenticated transactional storage and multi-instance concurrency guarantees.

**Completion gate:** exact-action approval, stale rejection, cancellation, expiry, replay, concurrent confirmation, and provider recovery are demonstrated for the selected demo mode, not inferred from tests of a different path.

## Phase 4 - Frontend and phone delivery: implemented, final device check open

- [x] Category budgets, spending feed, searchable/filterable transactions, expense entry, transfer review, and adjustment history.
- [x] Connected store uses backend reads/mutations and polls shared state every three seconds; connection warnings and Nessie refresh are available.
- [x] Browser text rehearsal uses shared server state; browser-only mode remains available separately.
- [x] Installable web app assets and pairing instructions are present.
- [x] Capacitor Android project and USB build/run scripts are present; no Expo migration is needed.
- [ ] Run the current build on the presentation phone and verify pairing, readable balances, activity updates, reconnect, and reset.
- [ ] Confirm the chosen setup works throughout the demo: Android debug app needs the laptop backend and USB port forwarding; public browser access and inbound SMS use the tunnel.

**Completion gate:** a backend-approved $20 move visibly changes the actual presentation UI to $58 / $40 with one adjustment entry.

## Phase 5 - Claude/SMS integration and rehearsal: current focus

- [x] Claude tool loop and bounded text history are wired into `server/agent.mjs` and the shared server when `ANTHROPIC_API_KEY` is set.
- [x] Scripted responder remains available when no Claude key is configured. A runtime Claude error produces a failure response; it does not transparently switch to the scripted responder.
- [x] Bandwidth inbound/outbound handling and SMS splitting are implemented. Automated tests use substituted providers; they are not proof of live Claude or handset delivery.
- [ ] Verify the configured model/key works with the actual provider and that startup reports the intended responder mode.
- [ ] Verify current tunnel, Bandwidth callback, and approved recipient; keep credentials and pairing tokens out of recordings.
- [ ] Reset to $38 / $60 and forward the $55 dinner invitation from the real phone.
- [ ] Confirm a grounded $17 category shortfall; request exactly $20 from Clothing to Dining, inspect the proposal, approve, and observe $58 / $40 in the app.
- [ ] Confirm no allocation change before approval and exactly one adjustment afterward.
- [ ] Rehearse cancellation, changed amount, duplicate delivery, expired/stale approval, and provider failure in the selected mode.
- [ ] Verify SMS failure after a committed change does not imply rollback or cause another transfer on retry.
- [ ] Repeat from reset and record evidence, date, mode, and owner for remaining failures.

### Do not mix the two command modes

- **Claude mode:** free-form conversation; `KEEP` asks to keep the plan by moving budget, `ALT` explores cheaper alternatives; exact `YES` approves the pending action. Pending actions normally expire after 30 minutes; uncertain submitted purchases remain reconcilable.
- **Scripted mode:** `DINNER` or the supported $55 invitation proposes the fixed $20 move; exact `YES <code>` confirms within five minutes. `CANCEL` **or `KEEP` cancels**. This is a deterministic fallback, not a natural-language agent demo.

**Completion gate:** real handset receipt/reply plus the current Claude/shared-backend/UI chain works repeatedly. Provider `accepted` status alone does not establish handset delivery.

## Phase 6 - Demo packaging and submission: pending

- [x] Startup, seed, phone pairing, Android USB, and Claude usage documentation exist.
- [ ] Update stale README/setup statements and explicitly document the selected demo mode and its approval commands.
- [ ] Have another teammate start, pair, reset, and reproduce the flow using only the instructions.
- [ ] Prepare a 60-90-second presentation: invitation -> grounded shortfall -> proposal -> approval -> visible budget/activity update.
- [ ] Record a complete real-SMS backup video using the final build.
- [ ] Prepare an architecture slide accurately showing React/Capacitor -> Node/file-backed state -> Nessie, with Claude tools and Bandwidth. Do not depict Supabase or Fetch.ai as integrated.
- [ ] Confirm organizer deadlines, eligibility, and sponsor-specific assets against current official materials before making prize claims. No eligibility check was performed in this review.
- [ ] Finish submission links, README/product story, design assets, and limitations.

**Completion gate:** another teammate can reproduce the demo, a backup exists, and the actual submission requirements are met.

## Expanded scope - proactive assistance and private groups

- [x] Claude ALT/search and explicitly approved Nessie sandbox purchase paths are implemented; live end-to-end verification remains open.
- [x] Foreground location lookup, simulated place buttons, and cooldown-based SMS nudges are implemented; live device/provider verification remains open.
- [ ] Fetch.ai orchestration is not integrated. Decide whether it is required for the intended submission before adding it.
- [ ] Social/group budgets and voice are not implemented.
- [ ] Native background location, push/geofencing infrastructure, native iOS packaging, store release, and real payment rails are not implemented.

**Scope:** location and cheaper alternatives are now part of the intended product. A limited demo cut may be necessary within 12 hours; this has not yet been agreed with the user. Nessie purchases use sandbox money; budget transfers only change allocations. A category allocation does not establish overall financial affordability. Forwarding is user initiated; the app does not read unrelated private conversations.

## Proposed 12-hour delivery plan - not yet a committed feature cut

This is a planning budget, not a promise that every new feature fits. Full background tracking, real private groups, onboarding, redesign, and transaction editing are too much to guarantee in one sequential workstream.

1. **Hours 0-2:** validate real-phone dinner SMS, close stale-approval behavior, and make the three decision paths explicit. Confirm the exact group messaging setup. Briefly check native background-location feasibility on the actual handset before committing to it.
2. **Hours 2-5:** ship a minimal first-run budget setup, persist it to shared state, and implement the final Home/recommendation direction. Keep transaction editing narrow but persistent across Nessie refresh; do not fabricate transaction timestamps missing from source data.
3. **Hours 5-8:** finish one risky integration: private group planning for the Meta story, or background Android location. Doing both needs a separate available teammate or additional time; no assignment has been assumed.
4. **Hours 8-12:** stop expanding scope. Test the actual handset and private-member isolation, rehearse/reset repeatedly, record the demo, prepare Figma assets and Devpost submission.

If Meta is a priority, favor a real small group-planning flow over additional payment/voice integrations. If closed-app proactive behavior is essential to the live pitch, prioritize native location and reduce group scope transparently. Do not present simulated friends or location as live activity.

### Proposed onboarding

- [ ] Name and phone setup; for the one-phone demo, explicitly show the preverified demo phone rather than pretending arbitrary numbers are verified.
- [ ] Choose Nessie sandbox data or manual setup. Real bank linking is future work unless separately implemented.
- [ ] Set a weekly/monthly discretionary spending total, savings/protected amounts if applicable, and category allocations. Let Lila suggest an editable split; require confirmation.
- [ ] Collect useful preferences: cuisines, dietary needs, walking distance, social activities, and optionally financial goals.
- [ ] Explain and request foreground/background location separately, with pause and quiet-hours controls. Texting remains server-side; do not request SMS inbox access.
- [ ] Show the personalized Home and a short SMS introduction. Budget/preference changes must affect the same state used by SMS recommendations.

### Proposed private group MVP

- [ ] Host creates an outing with area, time, interests, and an invite link.
- [ ] Each member joins through an independent private session and supplies preferences and a per-outing comfort limit. It need not expose or connect their entire bank account.
- [ ] Server filters candidates against everyone's limits; Claude ranks/explains compatible choices using only the minimum necessary shared context.
- [ ] Shared results show activities, estimated per-person total including relevant fees, and voting/selection. Do not expose member limits, raw financial records, or whose limit rejected a choice.
- [ ] If nothing fits, suggest free activities or ask for private revisions rather than revealing the limiting member.
- [ ] Test that one member cannot read another member's private data, including API responses. Hidden UI fields alone are insufficient. Small groups may still infer constraints; do not promise perfect anonymity.

A constrained real group prototype is plausible in the remaining time with dedicated ownership. Production accounts, invitations, all friends linked to banks, group SMS, and robust inference-resistant privacy are a larger project. One phone plus separate laptop browser sessions can demonstrate genuine member participation if the user agrees.

## Sponsor-track reassessment

Reviewed the two supplied PDFs and the current Devpost listing on October 24, 2026. Fit labels below are engineering/product judgments, not eligibility guarantees. The PDFs are snapshots; current sponsor-specific instructions take precedence where confirmed.

### Meta / Bringing People Closer Together with AI - strong direction, incomplete implementation

The guide judges human connection, essential AI integration, originality, and a working demo. Private group planning directly addresses awkward money conversations that keep friends from joining activities. The current personal dinner assistant has a social context but does not yet coordinate a group.

**Gap / solution:** implement a small real group with private limits/preferences, shared recommendations, and a chosen plan. Show an expensive suggestion being replaced by a plan the group likes without revealing whose finances constrained it. The supplied criteria do not state that Llama or another Meta API is mandatory; do not invent that requirement. Confirm any separate eligibility rules with the sponsor.

### Anthropic / Claude for Public Benefit - strong technical fit, sharpen community and evidence

The guide requires a named community, a lived/researched problem, a usable result, and meaningful Claude use. Claude currently reads budgets and uses approval-guarded actions.

**Gap / solution:** choose a specific community the team can honestly speak for (for example, Berkeley students managing a fixed monthly allowance who avoid outings because of cost). Validate with a few real peers and report actual observations. Demonstrate Claude interpreting an invitation and preferences, not just reciting a scripted threshold. Finish onboarding and show graceful refusal when data is unavailable.

### Microsoft / Built for the Real World and Customer Impact Award - promising, not production-ready

The guide emphasizes customer understanding, measurable usefulness, a path to production, responsible design, and end-to-end functionality. Shared state, audit history, approval checks, and failure tests support that story.

**Gap / solution:** finish onboarding, close the stale-proposal gap, demonstrate privacy boundaries, and measure observed response time / task completion / steps avoided. Do not invent savings or user-impact metrics. Explain the migration from single-process storage to authenticated transactional persistence and a real financial-data connector. The supplied rubric does not state an Azure requirement.

### Capital One / Best Use of Nessie - strongest existing integration

The guide lists completeness, creativity, and complexity. Imported sandbox transactions already drive category balances and decisions; sandbox purchases are also implemented.

**Gap / solution:** show a real sandbox read changing the shared app and the next SMS response. Preserve imported IDs and user corrections, prevent duplicate manual/imported entries, and demonstrate an understandable reset. Do not imply Nessie accesses the user's real credit-card statement or pays a real restaurant.

### Visa / Reimagining Shopping - good recommendation fit, incomplete purchase journey

The guide weights innovation and experience most heavily, with technical execution, commerce impact, and trust also considered. Contextual cheaper alternatives and preference-aware recommendations align well.

**Gap / solution:** show the full cheaper-option journey: context -> relevant alternatives -> explicit choice -> merchant details/directions. Explain estimated prices and comparison basis. Payment is not stated as mandatory in the supplied rubric; avoid adding a new payment system just for this track.

### Figma / Best Figma Workflow Hack - meaningful existing work, deliverables open

Devpost currently names this track Best Figma Workflow Hack. The supplied project notes describe a video up to three minutes, stage logs up to 200 words per stage, required Figma Slides, and embedded working prototypes/Make files. The linked official Google Doc could not be retrieved in this review, so those detailed deliverables remain PDF-backed pending confirmation.

**Gap / solution:** use Codex `- Final` designs in the working app, document actual ideation/prototyping/handoff/code-generation stages, provide accessible file/prototype links, and prepare Slides/video. Record real time spent and outcomes rather than reconstructing invented metrics. Design-only polish does not substitute for the workflow evidence.

### Fetch.ai / ASI:One Agent Challenge - currently missing mandatory integration

The official hackpack requires Agentverse registration, Agent Chat Protocol, discovery/direct use through ASI:One, meaningful tool execution, and the complete primary workflow inside ASI:One. It also calls for a public GitHub repo, Devpost plus the ASI:One submission agent, and demo materials. A Claude agent behind SMS is not sufficient.

**Gap / solution:** a separate teammate could expose the same budget read/propose/confirm operations through an ACP-compatible registered agent, with safe demo identity and approval binding, and prove the flow inside ASI:One. This adds another conversation surface and is a substantial diversion from the user's SMS-first priority. Defer unless someone owns it. The sponsor site and Devpost disagree on prize amounts; do not optimize scope around an unconfirmed amount.

### Cartesia / Best Use of Cartesia - poor fit with SMS-first scope

The supplied guide explicitly makes voice central to the product and requests a working demo, two-minute demo-first presentation, README, and source access.

**Gap / solution:** an actual spoken budgeting interaction using Cartesia would be needed. Decorative speech or friend recordings without Cartesia do not close the gap. Recommend deferring within this 12-hour window.

### Coinbase / Best Use of x402 - no qualifying integration yet

The project notes describe Coinbase MCP/x402 payment-agent work; the linked detailed brief could not be retrieved. Nessie sandbox purchases and category reallocations are not x402 usage.

**Gap / solution:** a real x402-authorized agent transaction with limits, explicit approval, and receipt would be needed, subject to confirming the exact track rules. It should solve a credible commerce problem, not just be attached to the demo. Recommend deferring.

**Recommended focus:** Nessie, Anthropic, Microsoft; Meta if the private group feature works; Visa and Figma through the same polished user journey and documented workflow. Defer new Fetch.ai, Cartesia, and Coinbase integrations unless a teammate already has substantial working code.

## External evidence checked

- [Current Devpost listing](https://cal-hacks-13-0.devpost.com/): deadline banner is October 25, 2026, 9:00 AM PDT; project image, repository, and demo required. Current listing says three-minute pitch plus two-minute questions; the PDF recommends two minutes. Prepare a two-minute core with an optional third minute. Confirm any organizer updates before submission.
- [Fetch.ai official hackpack](https://www.fetch.ai/events/hackathons/calhacks-13-0/hackpack): exact integration and submission requirements.
- [Bandwidth trial limits](https://dev.bandwidth.com/docs/messaging/build-free-trial/): one verified recipient, SMS only, six messages/minute and 200/day. Direct participation in a friends' group thread is not supported by this demo setup. Forwarding privately and manually sharing the chosen plan is viable.
- [Android background location](https://developer.android.com/develop/sensors-and-location/location/background) and [permission flow](https://developer.android.com/develop/sensors-and-location/location/permissions/background): native handling, permissions, and update limits matter. Current browser geolocation cannot meet closed-app tracking. Test screen-off and background behavior on the actual handset; do not promise operation after force-stop or with no connectivity.
- [Plaid Transactions](https://plaid.com/docs/transactions/): a consented real-bank connector can supply credit/depository transaction data, but typical updates are one to four times daily, not guaranteed instant purchase detection. Nessie remains the present sandbox source.

## Review sources

Implementation: `src/App.jsx`, `src/lib/store.js`, `src/lib/budget.js`, `server/index.mjs`, `server/agent.mjs`, `server/conversation.mjs`, `server/nessie.mjs`, the local/server test suites, `capacitor.config.json`, and Android project files. Setup and prior verification: [README](README.md), [phone rehearsal](docs/phone-demo.md), [Claude agent](docs/claude-agent.md), [Android setup](docs/android-usb.md).
