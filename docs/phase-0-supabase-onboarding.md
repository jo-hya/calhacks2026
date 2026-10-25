# Phase 0: Supabase accounts, onboarding, and a phone that doesn't need the laptop

Goal: someone installs the Lila APK on their phone, on cellular, with the laptop off. They sign up, finish a basic onboarding flow, and use Lila. Their data is private to their account. Nothing here touches real bank accounts or real money.

## Where things stand

- The APK is a Capacitor wrapper around `dist/`. In development it calls `http://localhost:3002` through `adb reverse` (`scripts/android.ps1`, `docs/android-usb.md`). Cleartext HTTP is allowed in the debug build only.
- The server (`server/index.mjs`) keeps all state in `.pocket/state.json`, a single shared file. Access is a pairing token that becomes a cookie. There is no sign-up and no per-user data.
- The frontend (`src/lib/store.js`) calls relative `/api/*` paths and has a browser-only localStorage mode.
- The budget logic is pure and tested (`src/lib/budget.js`, integer cents). It can move over mostly unchanged.
- Nessie, Bandwidth, the Claude agent, Cartesia, and Moss are all reached from the server. They stay there.

## Decisions (change any of these before we start)

1. **Supabase for auth and Postgres.** Email and password for v1, with Supabase's built-in email confirmation. Phone OTP needs an SMS provider in Supabase, so it waits. The phone number is collected in onboarding for SMS use only.
2. **The Node server stays.** It still runs the agent, SMS webhook, voice, and Nessie sync. It stops using `state.json`. It verifies the user's Supabase access token on every `/api/*` request.
3. **Per-user state in Postgres, one `jsonb` row per user with a `version` column.** Writes are compare-and-set (`update ... where version = $expected`). This keeps the existing pure budget functions and gives transfers the "stale state" protection the README describes, without a full table redesign. Normalizing into tables can come later.
4. **Row-level security on every table.** The browser can't reach the service-role key. The server uses the user's own token for reads and writes, so RLS enforces isolation even if the server has a bug.
5. **Demo mode stays.** The current pairing flow keeps working behind `POCKET_MODE=demo` so the existing rehearsal and tests still run. The new flow is `POCKET_MODE=accounts`, which is the default for the deployed build.
6. **Onboarding is resumable.** Progress is stored on the profile, so closing the app mid-flow returns to the same step.

## Supabase setup

- Create a Supabase project (you'll need to do this, since it's your account). Keep the URL, the anon/publishable key, and the service-role key.
- Put the publishable key and URL in the frontend env as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service-role key goes only in the server's `.env`. Never use a `VITE_` prefix for server secrets.
- Migration `supabase/migrations/0001_init.sql`:
  - `profiles`: `id uuid primary key references auth.users`, `display_name`, `phone_e164`, `onboarding_step`, `onboarding_completed_at`, `created_at`.
  - `budget_states`: `user_id uuid primary key references auth.users`, `state jsonb not null`, `version int not null default 1`, `updated_at`.
  - RLS enabled on both. Policies: `auth.uid() = id` (profiles) and `auth.uid() = user_id` (budget_states), for select, insert, update. No delete from the client.
  - A trigger creates the `profiles` row and a seeded `budget_states` row (from `createSeed()`) when a user signs up.

## Server changes (`server/index.mjs`, new `server/auth.mjs`, `server/store-supabase.mjs`)

- `auth.mjs`: read `Authorization: Bearer <token>`, call `supabase.auth.getUser(token)`, and attach `{ userId, supabase }` to the request. The supabase client is created with that token so RLS applies. Return 401 otherwise.
- Replace `load()`/`save()` in the request handler with `loadState(userId)` and `saveState(userId, state, expectedVersion)`. A version mismatch returns 409 and the client refreshes.
- Every existing `/api/*` route gets the user's state, applies the same pure operation, and saves. The routes themselves barely change.
- Agent and voice: the `ops` object that the agent uses is bound to the current user's state, not a global file. Memory (Moss) is keyed by `userId`. The first version can leave Moss on the built-in local index, keyed the same way.
- Bandwidth webhook: look up `profiles.phone_e164` to find the user. Phase 0 keeps the single verified number, mapped to the first account, so the existing SMS demo still works. Per-user phone routing comes later.
- CORS: allow the app origins (`https://localhost` and `capacitor://localhost` for the Capacitor WebView, plus the deployed web origin). Keep the cookie path for demo mode only.
- Health and webhooks stay unauthenticated (webhooks keep their token check).

## Frontend changes

- `src/lib/supabase.js`: create the client.
- `src/lib/store.js`: `request()` adds `Authorization: Bearer <session.access_token>` and reads the API base from `VITE_API_BASE` (empty for the dev proxy, the deployed URL for release). On 409 it refreshes state and retries once.
- `src/lib/session.js`: auth state (signed in, signed out, needs onboarding), using `onAuthStateChange`.
- Routing: signed out → Auth screen. Signed in but `onboarding_completed_at` is null → onboarding at `onboarding_step`. Otherwise → the existing app.
- The browser-only localStorage mode is kept for the web preview.

## Onboarding flow (basic, resumable)

| Step | Screen | Saves | Skippable |
|---|---|---|---|
| 0 | Welcome: what Lila does, one line each | nothing | no |
| 1 | Sign up or log in (email + password, "forgot password" via Supabase) | auth user + profile row | no |
| 2 | Check your email (only after sign-up, with resend) | nothing | no |
| 3 | About you: first name, phone number (E.164, for SMS) | `display_name`, `phone_e164` | phone yes |
| 4 | Monthly budget: the categories from the seed, each with an amount, prefilled | `budget_states.state` | no |
| 5 | Connect accounts: "Use sample accounts" (seeded Nessie-style data) and a greyed-out "Connect a bank (coming soon)" | `onboarding` flag | no |
| 6 | Permissions: location for nearby alternatives, notifications. Explain why before asking. | nothing (device prompts) | yes |
| 7 | Meet Lila: a short intro, one sample message, then Home | `onboarding_completed_at` | no |

Rules:
- Each step writes its own data and then advances `onboarding_step`. Going back is allowed. Nothing is written until the user taps Continue.
- Validation: name 1–40 characters, phone must parse as E.164, budget amounts are non-negative integer cents.
- "Use sample accounts" reuses the current seed. Real bank linking is Phase 1 (Plaid).

## Android and deployment

- Host the server (Fly.io or Render, either is fine). With state in Supabase, the server needs no persistent disk. Set the env vars from `.env.example`, plus the Supabase URL and service-role key.
- Build the web bundle with `VITE_API_BASE=https://<host>` and `VITE_SUPABASE_*`. Run `npm run build`, then `npx cap sync android`.
- Release-style debug APK for sideloading: the `server.url` entry in `scripts/android.ps1` is dev-only. For the deployed build, the WebView loads the bundled `dist/` and calls the HTTPS API. Cleartext stays off.
- Sideload the APK to your phone over the internet (a download link or Google Drive). "Install unknown apps" must be allowed on the phone. This is not the Play Store.
- Keep `.env` out of the APK. Only `VITE_*` values get bundled, and those must be public-safe.

## Tests

- Unit: onboarding step transitions and validation (new file next to `src/lib/budget.test.js`).
- Server, with the existing `node:test` setup: a request without a token gets 401; a version conflict gets 409; user A can't read user B's state (run against a local Supabase, or with a mocked client that enforces the same rule).
- RLS: a SQL test script in `supabase/tests/` that signs in as two users and checks each can see only their own rows.
- Existing demo tests keep passing with `POCKET_MODE=demo`.
- Manual acceptance (below).

## Phase 0 is done when

1. The laptop is off, and the phone is on cellular.
2. A new person installs the APK, signs up with email, confirms the email, and completes onboarding.
3. Their Home screen shows their own budget. Changing a budget on their phone updates it on a second device they're signed into.
4. A second account sees none of the first account's data (RLS test passes, and it's checked by hand).
5. Text and voice to Lila work from the deployed server.
6. Closing the app mid-onboarding and reopening it resumes at the same step.

## Estimate

Roughly 2 weeks of focused work, split:
- Supabase project, schema, RLS, seed trigger: 1–2 days
- Auth middleware and per-user state in the server: 3 days
- Frontend session, routing, store changes: 2 days
- Onboarding screens: 3 days
- Hosting, env, Capacitor build, sideloaded APK: 2 days
- Tests and phone testing: 2 days

## Out of scope for Phase 0

- Play Store listing (Phase 2)
- Real bank connections through Plaid (Phase 1)
- Real money movement (deferred)
- Phone OTP sign-in and per-user SMS routing
- Normalizing budget data into relational tables
- Account deletion in-app (needed before Play Store, not for sideloaded testing)
- Custom email domain for Supabase auth emails (the default sender is fine for testing, but may land in spam)

## Open questions

- Email and password only for v1, or do you want phone sign-in now?
- Should the sample-accounts step stay in the product, or should new users start empty?
- Who gets the Bandwidth SMS in Phase 0: the one verified number, mapped to the first account you create?
- Hosting: Fly.io or Render?
