# Voice Agent V2

TypeScript, Next.js, MongoDB voice agent API.

## Setup

1. **Install dependencies**

    ```bash
    npm install
    ```

2. **Environment**

    Copy `.env.example` to `.env.local` and set:
    - `OPENAI_API_KEY` — OpenAI API key (for Whisper, GPT, TTS)
    - `MONGODB_URI` — MongoDB connection string (e.g. `mongodb://localhost:27017/voice_agent`)

3. **MongoDB**

    Run MongoDB locally or use Atlas. No migrations; collections are created on first use. Optional indexes:
    - `users`: `{ apiKeyHash: 1 }`, `{ email: 1 }` unique
    - `sessions`: `{ userId: 1 }`, `{ lastActivityAt: 1 }`
    - `messages`: `{ sessionId: 1 }`, `{ sessionId: 1, createdAt: 1 }`

4. **FFmpeg** (for audio validation/conversion)

    Required for the voice conversation endpoint. Install FFmpeg and ensure `ffmpeg` and `ffprobe` are on `PATH`.

## Run

```bash
npm run dev   # http://localhost:3000
npm run build && npm start  # production
```

## API

- `GET /api/v1/health` — Health check
- `POST /api/v1/users/register` — Register; body: `{ "email": "..." }` → returns `userId`, `apiKey`
- `POST /api/v1/auth/login` — Login; body: `{ "apiKey": "..." }` → returns `token`, `userId`, `email`
- `POST /api/v1/sessions` — Create session (header: `Authorization: Bearer <apiKey>`)
- `GET /api/v1/sessions/:sessionId` — Get session
- `GET /api/v1/sessions/:sessionId/messages?limit=20` — Get messages
- `POST /api/v1/voice/conversation` — FormData: `audio` (file), optional `sessionId`; returns MP3 audio

## Quick test

```bash
# Register
curl -X POST http://localhost:3000/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Create session (use apiKey from above)
curl -X POST http://localhost:3000/api/v1/sessions \
  -H "Authorization: Bearer sk_..."

# Voice (use sessionId from above)
curl -X POST http://localhost:3000/api/v1/voice/conversation \
  -H "Authorization: Bearer sk_..." \
  -F "audio=@your-audio.wav" \
  -F "sessionId=..." \
  --output response.mp3
```

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **MongoDB**
- **OpenAI** (Whisper, GPT-3.5-turbo, TTS)
