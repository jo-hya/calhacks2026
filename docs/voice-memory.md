# Voice and memory

Lila can be talked to in the app (Cartesia) and remembers what users tell it (Moss).
All routes need the app's pairing cookie, like the rest of `/api/*`.

## Chat and voice in the app

Both screens (`src/Talk.jsx`) go to the same Claude agent as texts: same budget, Nessie
purchases, memory and YES-approval rules.

- **Chat** (the star in the bottom bar): typed messages and the two starter prompts go through
  `store.message(text)`. The thread shows only the current conversation; it starts fresh each
  time the star is tapped (messages carry an `at` time for this).
- **Voice** (the mic in the chat box) is hands-free (`src/lib/voiceSession.js`): it listens,
  ends your turn after a short pause, sends the recording with `store.voice(blob)` (Cartesia
  transcribes, Lila answers, Cartesia speaks), plays the answer, then listens again. The mic is
  ignored while Lila is talking, so she never hears herself. The left button mutes the mic, the
  centre wave pauses or resumes, and X ends the conversation. Sounds with no words (a cough, a
  door) are skipped quietly.
- The mic needs HTTPS on phones (open the app through the ngrok address) or `127.0.0.1` on the
  laptop. Safari records `audio/mp4`, Chrome and Android `audio/webm`; both work.
- The Android app has microphone permission (rebuild after pulling).

## Setup

In `.env` (see `.env.example`):

```
CARTESIA_API_KEY=...        # voice on
MOSS_PROJECT_ID=...         # memory search through Moss (free tier at moss.dev)
MOSS_PROJECT_KEY=...
```

`npm run demo` prints `Voice: on (Cartesia) · Memory search: Moss`. Without the Cartesia
key the voice routes return an error; without Moss keys memory still works with a simple
built-in word search.

## Talking to Lila

`POST /api/voice` with the raw recording as the body and its type as `Content-Type`
(`audio/webm` from Chrome/Android `MediaRecorder`, `audio/mp4` from Safari; max 5 MB).

1. Cartesia Ink transcribes it.
2. The same Claude agent answers (all the YES-approval rules apply), told its reply will be
   spoken: one or two short sentences.
3. Cartesia Sonic reads the answer aloud.

Response: the usual app state plus

```json
"voice": {
  "transcript": "Can I do dinner tonight? Nothing with meat.",
  "reply": "Dining has $38 left, so a $55 dinner is $17 over. Want a cheaper vegetarian spot?",
  "audio": "<base64 MP3>",
  "audioType": "audio/mpeg",
  "remembered": [{ "id": "a1b2c3d4", "text": "Vegetarian", "createdAt": "..." }]
}
```

Play it with `new Audio('data:audio/mpeg;base64,' + voice.audio).play()`. `remembered`
lists facts saved during this turn, for a "Remembered: Vegetarian · Undo" note.
`audio` is `null` if speech failed; show `reply` as text. When the recording has no words
(`transcript` is empty), no speech is generated.

`?speak=0` skips speech (Lila's voice turned off): the reply comes back as text only.

`POST /api/voice/ask` `{ "text": "...", "speak": true }` answers a typed or tapped question
(the starter prompts) the same way.

`POST /api/speak` `{ "text": "..." }` returns MP3 bytes, e.g. a **Listen** button on a heads-up.

## Memory

- The agent saves lasting facts users state about themselves (`remember_about_user`), only from
  the user's own messages, never from location updates. It doesn't save account numbers,
  passwords or health details beyond food preferences.
- Facts saved from a text (which may be forwarded from someone else) stay out of replies until
  the user confirms them under Settings → What Lila remembers. Only the app and voice can delete
  memories.
- Before every reply, the most relevant memories and purchases are looked up and given to
  Claude, so answers are personal without an extra step. With Moss, the index is loaded in
  memory, so this takes milliseconds.
- Purchases from Nessie are searchable too ("how much on boba?").
- The app state includes `memories` (the list) and `voiceEnabled`.
- `POST /api/memories` `{ "text": "Saving for Tahoe" }` adds one (e.g. from Profile).
- `POST /api/memories/forget` `{ "id": "a1b2c3d4" }` deletes one. Users can also say "forget that".
- **Reset demo** clears memories.
