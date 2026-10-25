# Voice and memory (backend)

Lila can be talked to in the app (Cartesia) and remembers what users tell it (Moss).
This is the backend; the screens are still to be designed. All routes need the app's
pairing cookie, like the rest of `/api/*`.

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
`audio` is `null` if speech failed; show `reply` as text.

`POST /api/speak` `{ "text": "..." }` returns MP3 bytes, e.g. a **Listen** button on a heads-up.

## Memory

- The agent saves lasting facts users state about themselves (`remember_about_user`), only from
  the user's own messages, never from location updates. It doesn't save account numbers,
  passwords or health details beyond food preferences.
- Before every reply, the most relevant memories and purchases are looked up and given to
  Claude, so answers are personal without an extra step. With Moss, the index is loaded in
  memory, so this takes milliseconds.
- Purchases from Nessie are searchable too ("how much on boba?").
- The app state includes `memories` (the list) and `voiceEnabled`.
- `POST /api/memories` `{ "text": "Saving for Tahoe" }` adds one (e.g. from Profile).
- `POST /api/memories/forget` `{ "id": "a1b2c3d4" }` deletes one. Users can also say "forget that".
- **Reset demo** clears memories.
