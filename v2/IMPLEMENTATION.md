# Voice Agent V2 — Implementation Summary

This document describes everything that is **implemented and working** in the V2 voice agent (TypeScript, Next.js, MongoDB).

**Document version:** 1.0  
**Last updated:** January 2026  
**Status:** Implemented and working

---

## 1. Overview

### Purpose

V2 is a full-stack voice agent that:

- Lets users **register** (email → API key) or **login** (API key).
- Provides a **web chat UI** where users can talk to the agent via **recorded audio** or **uploaded audio files**.
- Runs a **voice pipeline**: Speech-to-Text (Whisper) → LLM (GPT-3.5-turbo) → Text-to-Speech (OpenAI TTS) → returns MP3 and persists conversation in **MongoDB**.

### What Works End-to-End

- User opens the app → registers or logs in with API key → sees chat UI.
- User records or uploads audio → server transcribes → generates reply → synthesizes speech → browser plays MP3 and shows transcript + messages.
- Conversation history is stored per session and shown in the UI.
- All API endpoints respond correctly; errors (auth, validation, timeouts, DB) are handled and surfaced to the user.

---

## 2. Tech Stack

| Layer                | Technology                                                            |
| -------------------- | --------------------------------------------------------------------- |
| **Runtime**          | Node.js 18+                                                           |
| **Framework**        | Next.js 14 (App Router)                                               |
| **Language**         | TypeScript                                                            |
| **Database**         | MongoDB (native driver)                                               |
| **Auth**             | API key (Bearer), hashed with SHA-256                                 |
| **STT**              | OpenAI Whisper API (via axios + form-data to avoid 421)               |
| **LLM**              | OpenAI GPT-3.5-turbo                                                  |
| **TTS**              | OpenAI TTS API (tts-1, voice: alloy)                                  |
| **Audio processing** | FFmpeg / FFprobe (validation, convert to 16 kHz mono WAV for Whisper) |
| **Frontend**         | React (client components), CSS in `globals.css`                       |

### Key Dependencies

- `next`, `react`, `react-dom` — App and UI
- `openai` — Chat completions and TTS (LLM + TTS only; Whisper uses axios)
- `axios`, `form-data` — Whisper transcription (avoids Node fetch 421 Misdirected Request)
- `mongodb` — Database driver

---

## 3. Project Structure

```
v2/
├── src/
│   ├── app/
│   │   ├── api/v1/                    # API routes
│   │   │   ├── health/route.ts        # GET health
│   │   │   ├── users/register/route.ts
│   │   │   ├── auth/login/route.ts
│   │   │   ├── sessions/route.ts      # POST create session
│   │   │   ├── sessions/[sessionId]/route.ts
│   │   │   ├── sessions/[sessionId]/messages/route.ts
│   │   │   └── voice/conversation/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                   # Auth or Chat (client)
│   ├── components/
│   │   ├── AuthForm.tsx               # Login / Register
│   │   └── VoiceChat.tsx              # Messages, record, upload, playback
│   └── lib/
│       ├── api-client.ts              # Browser API helpers (register, login, sessions, messages, sendVoice)
│       ├── auth.ts                    # API key hash, validate, createUser
│       ├── auth-middleware.ts         # withAuth for API routes
│       ├── audio.ts                   # validateAudio, prepareAudioForWhisper (FFmpeg)
│       ├── conversation.ts            # createSession, getSession, getOrCreateSession, getConversationHistory, saveMessage
│       ├── db.ts                      # MongoDB getDb, ensureIndexes
│       ├── errors.ts                  # retryWithBackoff, apiError
│       ├── llm.ts                     # generateResponse (GPT-3.5-turbo)
│       ├── stt.ts                     # transcribeAudio (Whisper via axios + form-data)
│       └── tts.ts                     # synthesizeSpeech (OpenAI TTS)
├── .env.example
├── next.config.mjs
├── package.json
├── README.md
└── IMPLEMENTATION.md                  # This file
```

---

## 4. Features Implemented

### 4.1 Authentication

- **Register:** `POST /api/v1/users/register` with `{ "email": "..." }` → returns `userId`, `apiKey` (shown once). API key is stored hashed (SHA-256) in MongoDB.
- **Login:** `POST /api/v1/auth/login` with `{ "apiKey": "..." }` → returns `token`, `userId`, `email`.
- **Protected routes:** Sessions and voice endpoints require `Authorization: Bearer <apiKey>`. Middleware `withAuth` validates the key and attaches the user; on DB connection failure returns 503 with a clear message.

### 4.2 Web App (Chat UI)

- **Landing:** If no stored API key, user sees Login (enter API key) or Register (enter email). On success, API key is stored in `localStorage` and the user is taken to the chat view.
- **Chat view:**
    - **Messages:** Scrollable list of “You” and “Agent” messages (transcript and assistant text).
    - **Record:** Button to start/stop recording; audio is sent as WebM. Status shows “Recording…”, “Thinking…”, “Playing…”.
    - **Upload:** File input for audio (WAV, MP3, WebM, etc.). Same pipeline as record.
    - **Playback:** Response audio is played in the browser; messages are refreshed after playback.
    - **Logout:** Clears stored API key and returns to auth screen.
- **Errors:** Connection/session errors show a message and a **Retry** button. Voice request has a 2-minute timeout with a clear timeout message.

### 4.3 Sessions and Messages

- **Create session:** `POST /api/v1/sessions` (with auth) → returns `sessionId`, `createdAt`. The web app creates a session on load.
- **Get session:** `GET /api/v1/sessions/:sessionId` (with auth) → returns session metadata.
- **Get messages:** `GET /api/v1/sessions/:sessionId/messages?limit=50` (with auth) → returns `messages: [{ role, content }]`.
- **Persistence:** Sessions and messages are stored in MongoDB. Indexes are created on first DB use (users, sessions, messages).

### 4.4 Voice Conversation Pipeline

- **Endpoint:** `POST /api/v1/voice/conversation`
    - **Headers:** `Authorization: Bearer <apiKey>`
    - **Body:** `multipart/form-data` with `audio` (file) and optional `sessionId`.

- **Server flow:**
    1. Validate and parse form (audio required).
    2. Write upload to a temp file (safe filename for Windows).
    3. Validate audio (FFprobe: size ≤ 25 MB, duration ≤ 5 min).
    4. Get or create session for the user.
    5. Convert audio to 16 kHz mono WAV with FFmpeg (for Whisper).
    6. **Transcribe** with Whisper (via axios + form-data to avoid 421).
    7. Load last 20 messages for context.
    8. **Generate reply** with GPT-3.5-turbo (system + history + user).
    9. **Synthesize speech** with OpenAI TTS (tts-1, alloy).
    10. Save user and assistant messages to MongoDB.
    11. Return binary MP3 with headers `X-Session-Id`, `X-Transcript`.
    12. Temp files are deleted in `finally`.

- **Retries:** STT, LLM, and TTS use `retryWithBackoff` (max 2 retries) for transient failures.
- **Logging:** Console logs indicate progress: “Audio prepared”, “STT done”, “LLM done”, “TTS done”, and full error stack on failure.

---

## 5. API Reference (Implemented and Working)

| Method | Path                                   | Auth   | Description                                                                |
| ------ | -------------------------------------- | ------ | -------------------------------------------------------------------------- |
| GET    | `/api/v1/health`                       | No     | Health check; returns `{ status, timestamp, service }`.                    |
| POST   | `/api/v1/users/register`               | No     | Body: `{ "email": "..." }`. Returns `userId`, `apiKey`, `message`.         |
| POST   | `/api/v1/auth/login`                   | No     | Body: `{ "apiKey": "..." }`. Returns `token`, `userId`, `email`.           |
| POST   | `/api/v1/sessions`                     | Bearer | Creates session. Returns `sessionId`, `createdAt`.                         |
| GET    | `/api/v1/sessions/:sessionId`          | Bearer | Returns session object.                                                    |
| GET    | `/api/v1/sessions/:sessionId/messages` | Bearer | Query: `limit` (default 20). Returns `{ messages }`.                       |
| POST   | `/api/v1/voice/conversation`           | Bearer | FormData: `audio` (file), optional `sessionId`. Returns MP3 or JSON error. |

Error responses are JSON: `{ "error": "CODE", "message": "..." }` with appropriate status (400, 401, 404, 429, 500, 503).

---

## 6. Configuration

### Environment (`.env.local`)

| Variable                     | Required | Description                                                               |
| ---------------------------- | -------- | ------------------------------------------------------------------------- |
| `OPENAI_API_KEY`             | Yes      | OpenAI API key (Whisper, GPT, TTS).                                       |
| `MONGODB_URI`                | Yes      | MongoDB connection string (e.g. `mongodb://localhost:27017/voice_agent`). |
| `NODE_ENV`                   | No       | `development` / `production`.                                             |
| `MAX_AUDIO_SIZE_MB`          | No       | Default 25.                                                               |
| `MAX_AUDIO_DURATION_SECONDS` | No       | Default 300.                                                              |

### External Requirements

- **MongoDB:** Running locally or Atlas; no migrations; collections and indexes created on first use.
- **FFmpeg:** On `PATH` (for `ffmpeg` and `ffprobe`). Used for validation and converting uploads to WAV for Whisper.

---

## 7. Implementation Notes (What Was Fixed / Chosen)

### 7.1 Whisper (STT) and 421 Misdirected Request

- **Issue:** Node’s built-in fetch (Undici) uses HTTP/1.1. Some environments (e.g. Cloudflare in front of `api.openai.com`) return **421 Misdirected Request**, which can surface as “Connection error” when calling the OpenAI SDK for transcriptions.
- **Solution:** Whisper is **not** called via the OpenAI SDK. It is implemented in `src/lib/stt.ts` using **axios** and **form-data**: the file is streamed with `fs.createReadStream`, and the request is sent with Node’s `https` stack. This avoids the 421/Undici issue and is **implemented and working**.

### 7.2 FormData and “language: null”

- **Issue:** Passing `language: null` in the Whisper request (when using the SDK) could cause “Received null for language; to pass null in FormData, you must use the string 'null'”.
- **Resolution:** The custom Whisper implementation does not send `language`; Whisper auto-detects language. No null is sent.

### 7.3 Connection Error and “Stuck at Thinking”

- **Issue:** Users saw “Connection error” or stayed on “Thinking…” when the server or DB was unreachable or when the voice request took too long or failed.
- **Solutions implemented:**
    - **Backend:** Auth and session routes catch DB/connection errors and return 503 with a clear message (e.g. “Database connection failed. Check that MongoDB is running…”).
    - **Frontend:** If `fetch` throws (e.g. server down), a friendly “Connection error. Is the server running?” message is shown. A **Retry** button re-runs session creation.
    - **Voice:** Client-side timeout of **2 minutes** for the voice request; on timeout, a clear message is shown and status resets. “Thinking…” text explains that the step may take 30–60 seconds.
    - **Status:** A `finally` in the voice handler ensures the UI never stays stuck on “sending”.

### 7.4 Temp File Paths on Windows

- **Issue:** Temp paths with spaces or special characters could break FFmpeg when invoked via `exec`.
- **Solution:** The voice route sanitizes the uploaded filename (e.g. replace non-alphanumeric with `_`) before building the temp path.

### 7.5 MongoDB Indexes

- Indexes for `users`, `sessions`, and `messages` are created in `getDb()` on first use. Failures (e.g. already exist) are ignored.

---

## 8. How to Run and Verify

### Install and run

```bash
cd v2
npm install
cp .env.example .env.local
# Edit .env.local: set OPENAI_API_KEY and MONGODB_URI
npm run dev
```

Open `http://localhost:3000`.

### Quick verification

1. **Health:** `curl http://localhost:3000/api/v1/health`
2. **Register:** `curl -X POST http://localhost:3000/api/v1/users/register -H "Content-Type: application/json" -d '{"email":"test@example.com"}'` → save `apiKey`.
3. **Web app:** In the browser, log in with that API key → chat view loads.
4. **Voice:** Click Record, speak, click Stop → after “Thinking…”, response plays and messages update. Or use Upload with an audio file.

### Production build

```bash
npm run build
npm start
```

---

## 9. Summary Checklist

| Item                                              | Status      |
| ------------------------------------------------- | ----------- |
| Next.js 14 App Router + TypeScript                | Implemented |
| MongoDB connection and indexes                    | Implemented |
| User registration (email → API key)               | Implemented |
| Login (API key validation)                        | Implemented |
| Session create / get / messages                   | Implemented |
| Voice conversation (STT → LLM → TTS)              | Implemented |
| Web UI (auth + chat + record + upload + playback) | Implemented |
| Error handling (auth, DB, timeout, retry)         | Implemented |
| Whisper via axios/form-data (avoid 421)           | Implemented |
| FFmpeg validation and conversion                  | Implemented |
| Logging and step markers for voice pipeline       | Implemented |

This V2 implementation is **complete and working** as described above.
