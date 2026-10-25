# Lila

**Ask out loud before you buy.** Lila is a voice-first spending companion. Money decisions
happen when your hands and eyes are busy: walking into a restaurant with friends, standing at a
checkout. Nobody opens a budgeting app then. With Lila you ask *"Can I do dinner tonight?"* and
hear a straight answer in a few seconds, grounded in your real budget and purchases, with a
cheaper option if it won't fit. Built for Cal Hacks 13.0.

## The voice flow

1. Tap the mic and say: *"My friends want a $55 dinner tonight. Can I? I'm vegetarian."*
2. Lila answers out loud: dining has $38 left, so it's $17 over. Move money from Clothing, or
   find somewhere cheaper?
3. *"Somewhere cheaper."* She finds real nearby vegetarian spots (she remembered) that fit.
4. *"Yes."* The payment goes through the Capital One sandbox account and the budgets on screen
   update. Nothing moves until you say yes.

The same agent also answers texts, so a conversation can start by voice and finish by SMS.

## What Cartesia does

| | Cartesia | Where |
|---|---|---|
| Hearing you | **Ink** speech-to-text (`ink-whisper`, batch). Chrome/Android `webm` and Safari `mp4` recordings | `server/voice.mjs` `transcribe()` |
| Lila's voice | **Sonic** text-to-speech (`sonic-3.5`, MP3) with a chosen voice (`db6b0ed5-…`) | `server/voice.mjs` `speak()` |
| Speaking style | Replies on the voice channel are told they'll be read aloud: one or two short sentences, no lists or symbols, "just say yes" | `server/agent.mjs` `VOICE_RULES` |
| Speaker button off | Answers come back as captions only; no speech is generated | `?speak=0` / `speak: false` |
| Read aloud | Any text (e.g. a location heads-up) can be spoken | `POST /api/speak` |

Other tools: **Claude** decides what to say and when to propose moving money; **Moss** is Lila's
memory (preferences you've told her plus your purchases, searched in milliseconds before each
reply); **Capital One Nessie** holds the sandbox account and purchases; **Bandwidth** sends
texts. API details: [Voice and memory](docs/voice-memory.md).

## Setup

Node.js 22.18+.

```sh
npm install
cp .env.example .env    # fill in your own keys (never commit .env)
npm run nessie:seed     # first time only: creates the sandbox account; add the printed NESSIE_ACCOUNT_ID to .env
npm run build
npm run demo            # prints a private pairing link; open it, then tap the mic
```

Keys in `.env`: `ANTHROPIC_API_KEY`, `CARTESIA_API_KEY`, `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY`,
`NESSIE_API_KEY`, and the `BANDWIDTH_*` values for texting. Startup prints
`Voice: on (Cartesia) · Memory search: Moss` when voice and memory are configured. The mic needs
`127.0.0.1` on the laptop or HTTPS on a phone (`ngrok http 3002`, then open the pairing link on
the ngrok address). No keys or secrets are in the repo.

## Responsibility, privacy and accessibility

- **No always-on listening.** Audio is only sent while the voice screen is open and not muted;
  recordings are transcribed and discarded, never stored.
- **Money never moves on its own.** Lila can only propose; a transfer or payment needs the
  user's own "yes" in a later message, enforced in code (a forwarded "YES" or a location update
  doesn't count). If something fails mid-way, Lila says the action *may* have completed rather
  than claiming nothing changed.
- **Memory you can see and delete.** Lila only remembers what you say about yourself (never
  account numbers or passwords); the app lists it with Undo, and "forget that" works. Demo reset
  clears it.
- **Not voice-only.** Every answer has a text caption, there's a text box, and the speaker
  button turns speech off, for noisy places, quiet places, and deaf or hard-of-hearing users.
- **Sandbox only.** Nessie is a test bank; no real money moves.

## Known limitations

- **Not streamed yet:** Lila starts speaking after the whole answer is ready (a few seconds).
  Next step: stream Claude's reply into Cartesia's streaming TTS so speech starts in under a
  second.
- One demo user (Sam); no accounts.
- Location heads-ups only while the app is open (no background location).
- Bandwidth's free trial texts a single verified phone, 129 characters per text.
- Nessie stores whole dollars, so amounts are rounded.

---

## Developer notes

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

The demo uses **October 2026** and a fictional user, Jamie Parker. It starts with $38 remaining in Dining and $60 in Clothing (the stable `shopping` category ID). Moving $20 from Clothing to Dining leaves $58 and $40 respectively. Total allocation and transaction spending stay unchanged. Existing saved purchases and Groceries are preserved; amounts are calculated from the demo data rather than copied from Figma's illustrative figures. Native phone status and gesture bars are left to the device.

## Demo walkthrough

1. On Home, tap the notification bell, then **Make room for dinner**.
2. Review a $20 transfer from Clothing to Dining. No allocation changes before confirmation.
3. Confirm the transfer. Budgets shows $58 left in Dining and $40 in Clothing; Activity records the adjustment.
4. Reload to verify persistence. Profile → **Reset demo** restores the original scenario.
5. Tap the center **+** → **Add a purchase** to update the feed and category spending. Home → **View all** opens searchable transactions.

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
