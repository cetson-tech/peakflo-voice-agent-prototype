# Voice Agent Architecture Document — V2 (TypeScript, Next.js, MongoDB)

## Table of Contents

1. [Overview](#overview)
2. [MVP Scope](#mvp-scope)
3. [System Architecture](#system-architecture)
4. [Core Components](#core-components)
5. [Critical Supporting Modules](#critical-supporting-modules)
6. [Complete Data Flow](#complete-data-flow)
7. [Technology Stack](#technology-stack)
8. [Complete API Design](#complete-api-design)
9. [Database Schema (MongoDB)](#database-schema-mongodb)
10. [Complete Implementation Guide](#complete-implementation-guide)
11. [End-to-End Verification](#end-to-end-verification)

---

## Overview

### Purpose

This document describes the **V2** architecture for the Voice Agent system using **TypeScript**, **Next.js**, and **MongoDB**. It preserves the same MVP capabilities as the original design while adopting a modern full-stack stack.

### MVP Goals

- ✅ **Functional**: Complete voice conversation flow works end-to-end
- ✅ **Type-safe**: TypeScript across API and shared types
- ✅ **Unified stack**: Next.js for API routes and optional frontend
- ✅ **Document store**: MongoDB for users, sessions, and messages

### Key Capabilities (MVP)

- ✅ Speech-to-Text (STT) using OpenAI Whisper API
- ✅ Text-to-Speech (TTS) using OpenAI TTS API
- ✅ Natural language understanding using OpenAI GPT-3.5-turbo
- ✅ Conversation management with context
- ✅ Authentication (API keys)
- ✅ Session management
- ✅ Error handling
- ✅ File upload handling
- ✅ MongoDB persistence

---

## MVP Scope

### What MVP Includes (Complete List)

**Core Functionality:**

1. ✅ User sends audio → System transcribes → System understands → System responds → System speaks
2. ✅ Conversation context maintained (last 10–20 messages)
3. ✅ Session management (create, get, update, cleanup)
4. ✅ Authentication (API key validation)
5. ✅ File upload handling (multipart/form-data)
6. ✅ Audio format validation and conversion
7. ✅ Error handling with retries
8. ✅ MongoDB persistence

**Infrastructure:**

1. ✅ Next.js API routes (App Router or Pages Router)
2. ✅ MongoDB with Mongoose ODM
3. ✅ TypeScript throughout
4. ✅ File upload handling (Next.js / FormData)
5. ✅ CORS configuration
6. ✅ Request size limits
7. ✅ Error handling and logging

**API Endpoints:**

1. ✅ Health check
2. ✅ Authentication (login with API key)
3. ✅ Session management (create, get)
4. ✅ Voice conversation (main endpoint)
5. ✅ User registration (create API key)

---

## System Architecture

### V2 Architecture (Next.js + MongoDB)

```
┌─────────────────────────────────────────┐
│         Client Application              │
│  (Web Browser / Mobile App / CLI)       │
└─────────────────┬───────────────────────┘
                  │
                  │ HTTP/REST API
                  │ (multipart/form-data)
                  │
┌─────────────────▼───────────────────────┐
│      Next.js Application                │
│  ┌─────────────────────────────────┐   │
│  │  Next.js API Routes              │   │
│  │  app/api/v1/... or pages/api/... │   │
│  │  - Body parsing (JSON + Form)    │   │
│  │  - Request size limits           │   │
│  └──────────────┬──────────────────┘   │
│                 │                        │
│  ┌──────────────▼──────────────────┐   │
│  │  Authentication (lib/auth)      │   │
│  │  - API Key Validation            │   │
│  │  - User Identification           │   │
│  └──────────────┬──────────────────┘   │
│                 │                        │
│  ┌──────────────▼──────────────────┐   │
│  │  Conversation Manager            │   │
│  │  - Session Management             │   │
│  │  - Context Tracking               │   │
│  └──────────────┬──────────────────┘   │
│                 │                        │
│  ┌──────────────▼──────────────────┐   │
│  │  Voice Processing Pipeline       │   │
│  │  1. Audio Preprocessing           │   │
│  │  2. STT (OpenAI Whisper)          │   │
│  │  3. LLM (OpenAI GPT)              │   │
│  │  4. TTS (OpenAI TTS API)          │   │
│  │  5. Save to MongoDB               │   │
│  └─────────────────────────────────┘   │
└─────────────────┬───────────────────────┘
                   │
     ┌─────────────┼─────────────┐
     │             │             │
┌────▼────┐   ┌────▼────┐  ┌────▼────┐
│  STT    │   │   LLM   │  │  TTS    │
│ Whisper │   │ GPT-3.5 │  │ TTS API │
└─────────┘   └─────────┘  └─────────┘
                   │
     ┌─────────────▼─────────────┐
     │    MongoDB                │
     │  - users                  │
     │  - sessions               │
     │  - messages               │
     └───────────────────────────┘
```

---

## Core Components

### 1. Speech-to-Text (STT) Module

**Technology**: OpenAI Whisper API

**TypeScript Implementation**:

```typescript
// lib/stt.ts
import OpenAI from "openai";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function transcribeAudio(
    audioFile: string | Buffer,
): Promise<string> {
    try {
        const file =
            typeof audioFile === "string"
                ? (fs.createReadStream(audioFile) as unknown as File)
                : new File([audioFile], "audio.wav", { type: "audio/wav" });

        const transcript = await openai.audio.transcriptions.create({
            file,
            model: "whisper-1",
            language: null,
            response_format: "json",
        });

        return transcript.text ?? "";
    } catch (error) {
        throw new Error(
            `STT Error: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
```

---

### 2. Text-to-Speech (TTS) Module

**Technology**: OpenAI TTS API

**TypeScript Implementation**:

```typescript
// lib/tts.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function synthesizeSpeech(text: string): Promise<Buffer> {
    if (text.length > 4096) {
        throw new Error("Text exceeds 4096 character limit");
    }

    const response = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
```

---

### 3. LLM Module (Intent & Response)

**Technology**: OpenAI GPT-3.5-turbo

**TypeScript Implementation**:

```typescript
// lib/llm.ts
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export async function generateResponse(
    userText: string,
    conversationHistory: ChatMessage[],
): Promise<string> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
            role: "system",
            content:
                "You are a helpful voice assistant. Keep responses concise and natural for voice conversation.",
        },
        ...conversationHistory
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userText },
    ];

    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        max_tokens: 500,
        temperature: 0.7,
    });

    return response.choices[0]?.message?.content ?? "";
}
```

---

### 4. Conversation Manager (MongoDB)

**TypeScript Implementation**:

```typescript
// lib/conversation.ts
import { getDb } from "./db";

export async function createSession(userId: string): Promise<string> {
    const db = await getDb();
    const result = await db.collection("sessions").insertOne({
        userId,
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata: {},
    });
    return result.insertedId.toString();
}

export async function getSession(sessionId: string, userId: string) {
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    const session = await db.collection("sessions").findOne({
        _id: new ObjectId(sessionId),
        userId,
    });
    return session;
}

export async function getOrCreateSession(
    userId: string,
    sessionId: string | null,
): Promise<string> {
    if (sessionId) {
        const session = await getSession(sessionId, userId);
        if (session) {
            const db = await getDb();
            await db
                .collection("sessions")
                .updateOne(
                    { _id: session._id },
                    { $set: { lastActivityAt: new Date() } },
                );
            return sessionId;
        }
    }
    return createSession(userId);
}

export async function getConversationHistory(
    sessionId: string,
    limit = 20,
): Promise<{ role: string; content: string }[]> {
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    const messages = await db
        .collection("messages")
        .find({ sessionId: new ObjectId(sessionId) })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();

    return messages.map((m) => ({ role: m.role, content: m.content }));
}

export async function saveMessage(
    sessionId: string,
    role: string,
    content: string,
): Promise<void> {
    const db = await getDb();
    const { ObjectId } = await import("mongodb");
    await db.collection("messages").insertOne({
        sessionId: new ObjectId(sessionId),
        role,
        content,
        createdAt: new Date(),
    });
}
```

---

## Critical Supporting Modules

### 5. Authentication Module (TypeScript)

```typescript
// lib/auth.ts
import crypto from "crypto";
import { getDb } from "./db";

export function hashApiKey(apiKey: string): string {
    return crypto.createHash("sha256").update(apiKey).digest("hex");
}

export function generateApiKey(): string {
    return "sk_" + crypto.randomBytes(32).toString("hex");
}

export interface AuthUser {
    id: string;
    email: string;
}

export async function validateApiKey(apiKey: string): Promise<AuthUser | null> {
    const hashedKey = hashApiKey(apiKey);
    const db = await getDb();
    const user = await db
        .collection("users")
        .findOne({ apiKeyHash: hashedKey });
    if (!user) return null;
    return { id: user._id.toString(), email: user.email };
}

export async function createUser(
    email: string,
): Promise<{ userId: string; apiKey: string }> {
    const apiKey = generateApiKey();
    const hashedKey = hashApiKey(apiKey);
    const db = await getDb();
    const result = await db.collection("users").insertOne({
        email,
        apiKeyHash: hashedKey,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return { userId: result.insertedId.toString(), apiKey };
}
```

---

### 6. Audio Preprocessing Module

```typescript
// lib/audio.ts
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

const ALLOWED_MIMES = [
    "audio/wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/webm",
    "audio/ogg",
    "audio/flac",
];

export function isAllowedMime(mimetype: string): boolean {
    return ALLOWED_MIMES.includes(mimetype);
}

export async function validateAudio(filePath: string): Promise<{
    valid: boolean;
    duration?: number;
    size?: number;
    error?: string;
}> {
    if (!fs.existsSync(filePath)) {
        return { valid: false, error: "Audio file not found" };
    }
    const stats = fs.statSync(filePath);
    const maxSize = 25 * 1024 * 1024;
    if (stats.size > maxSize) {
        return { valid: false, error: "Audio file too large (max 25MB)" };
    }
    try {
        const { stdout } = await execPromise(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
        );
        const duration = parseFloat(stdout.trim());
        if (duration > 300) {
            return {
                valid: false,
                error: "Audio duration too long (max 5 minutes)",
            };
        }
        return { valid: true, duration, size: stats.size };
    } catch {
        return {
            valid: false,
            error: "Invalid audio file or format not supported",
        };
    }
}

export async function prepareAudioForWhisper(
    inputPath: string,
): Promise<string> {
    const outputPath = inputPath + ".wav";
    await execPromise(
        `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}" -y`,
    );
    if (inputPath !== outputPath && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
    }
    return outputPath;
}
```

---

### 7. Error Handling & Retry

```typescript
// lib/errors.ts
export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 2,
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            const status = (error as { response?: { status?: number } })
                ?.response?.status;
            if (status && status < 500) throw error;
            if (attempt < maxRetries) {
                await new Promise((r) =>
                    setTimeout(r, Math.pow(2, attempt) * 1000),
                );
            }
        }
    }
    throw lastError;
}

export function apiError(
    status: number,
    code: string,
    message: string,
    extra?: Record<string, unknown>,
) {
    return Response.json({ error: code, message, ...extra }, { status });
}
```

---

## Complete Data Flow

Same as MVP: Client → Next.js API → Auth → Audio validation → Session get/create → STT → History → LLM → TTS → Save messages → Return audio. Errors mapped to appropriate HTTP status and JSON body.

---

## Technology Stack

### V2 Stack

#### Core Services

- **STT**: OpenAI Whisper API (`whisper-1`)
- **TTS**: OpenAI TTS API (`tts-1`, voice: `alloy`)
- **LLM**: OpenAI GPT-3.5-turbo

#### Application

- **Framework**: Next.js 14+ (App Router or Pages Router)
- **Language**: TypeScript
- **Dependencies**:
    - `next` – React framework and API routes
    - `openai` – OpenAI SDK
    - `mongodb` – MongoDB driver (or `mongoose` for ODM)
    - `winston` or built-in logging – Logging
    - `crypto` – API key hashing (Node built-in)

#### Database

- **MongoDB** 6+
- **Driver**: `mongodb` or **Mongoose** for schemas and validation

#### Audio Processing

- **FFmpeg** / **FFprobe** – Audio conversion and validation

#### Deployment

- **Docker** + **docker-compose**
- **Node.js** 18+

---

## Complete API Design

Same contract as MVP; base path can be `/api/v1` under Next.js.

- `GET /api/v1/health` → `{ status: "ok", timestamp: "ISO8601" }`
- `POST /api/v1/users/register` → Body: `{ email }` → `{ userId, apiKey, message }`
- `POST /api/v1/auth/login` → Body: `{ apiKey }` → `{ token, userId, email }`
- `POST /api/v1/sessions` → Auth: Bearer → `{ sessionId, createdAt }`
- `GET /api/v1/sessions/:sessionId` → Auth: Bearer → `{ session }`
- `POST /api/v1/voice/conversation` → Auth: Bearer, FormData: `audio`, optional `sessionId` → binary audio or JSON error
- `GET /api/v1/sessions/:sessionId/messages?limit=20` → Auth: Bearer → `{ messages }`

---

## Database Schema (MongoDB)

### Collections and Indexes

**users**:

```javascript
{
  _id: ObjectId,
  email: string,           // unique
  apiKeyHash: string,      // unique
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { apiKeyHash: 1 }, { email: 1 } unique
```

**sessions**:

```javascript
{
  _id: ObjectId,
  userId: ObjectId,        // ref users._id
  createdAt: Date,
  lastActivityAt: Date,
  metadata: object
}
// Indexes: { userId: 1 }, { lastActivityAt: 1 }
```

**messages**:

```javascript
{
  _id: ObjectId,
  sessionId: ObjectId,    // ref sessions._id
  role: "user" | "assistant" | "system",
  content: string,
  audioUrl?: string,
  createdAt: Date
}
// Indexes: { sessionId: 1 }, { sessionId: 1, createdAt: 1 }
```

**Mongoose schema example (optional)**:

```typescript
// models/User.ts
import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    apiKeyHash: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});
export const User = mongoose.models.User ?? mongoose.model("User", UserSchema);
```

---

## Complete Implementation Guide

### Step 1: Project Setup

```bash
npx create-next-app@latest voice-agent-v2 --typescript --eslint --app --src-dir
cd voice-agent-v2
npm install openai mongodb
npm install -D @types/node
```

### Step 2: Environment Configuration

**.env.local**:

```env
OPENAI_API_KEY=sk-your-openai-api-key
MONGODB_URI=mongodb://localhost:27017/voice_agent
NODE_ENV=development
MAX_AUDIO_SIZE_MB=25
MAX_AUDIO_DURATION_SECONDS=300
```

### Step 3: MongoDB Connection

```typescript
// lib/db.ts
import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI!;
let client: MongoClient;
let db: Db;

export async function getDb(): Promise<Db> {
    if (db) return db;
    client = new MongoClient(uri);
    await client.connect();
    db = client.db();
    return db;
}
```

### Step 4: Next.js API Routes (App Router)

**app/api/v1/health/route.ts**:

```typescript
import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "voice-agent-api",
    });
}
```

**app/api/v1/users/register/route.ts**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
    const { email } = await req.json();
    if (!email) {
        return NextResponse.json(
            { error: "VALIDATION_ERROR", message: "Email is required" },
            { status: 400 },
        );
    }
    const { userId, apiKey } = await createUser(email);
    return NextResponse.json({
        userId,
        apiKey,
        message:
            "API key created. Save this key securely - it will not be shown again.",
    });
}
```

**lib/auth-middleware.ts** (get user from Bearer token for API routes):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, type AuthUser } from "@/lib/auth";

export async function withAuth(
    req: NextRequest,
    handler: (req: NextRequest, user: AuthUser) => Promise<NextResponse>,
): Promise<NextResponse> {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json(
            {
                error: "UNAUTHORIZED",
                message: "Missing or invalid authorization header",
            },
            { status: 401 },
        );
    }
    const apiKey = authHeader.slice(7);
    const user = await validateApiKey(apiKey);
    if (!user) {
        return NextResponse.json(
            { error: "INVALID_API_KEY", message: "Invalid API key" },
            { status: 401 },
        );
    }
    return handler(req, user);
}
```

**app/api/v1/voice/conversation/route.ts**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, existsSync } from "fs/promises";
import path from "path";
import os from "os";
import { withAuth } from "@/lib/auth-middleware";
import { getOrCreateSession } from "@/lib/conversation";
import { validateAudio, prepareAudioForWhisper } from "@/lib/audio";
import { transcribeAudio } from "@/lib/stt";
import { synthesizeSpeech } from "@/lib/tts";
import { generateResponse } from "@/lib/llm";
import { getConversationHistory, saveMessage } from "@/lib/conversation";
import { retryWithBackoff } from "@/lib/errors";

async function handler(req: NextRequest, user: { id: string }) {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const sessionId = (formData.get("sessionId") as string) || null;

    if (!audioFile?.size) {
        return NextResponse.json(
            { error: "VALIDATION_ERROR", message: "Audio file is required" },
            { status: 400 },
        );
    }

    const tmpDir = os.tmpdir();
    const tmpPath = path.join(tmpDir, `voice-${Date.now()}-${audioFile.name}`);

    try {
        const bytes = await audioFile.arrayBuffer();
        await writeFile(tmpPath, Buffer.from(bytes));

        const validation = await validateAudio(tmpPath);
        if (!validation.valid) {
            return NextResponse.json(
                { error: "VALIDATION_ERROR", message: validation.error },
                { status: 400 },
            );
        }

        const activeSessionId = await getOrCreateSession(user.id, sessionId);
        const preparedPath = await prepareAudioForWhisper(tmpPath);

        const transcript = await retryWithBackoff(
            () => transcribeAudio(preparedPath),
            2,
        );
        if (!transcript?.trim()) {
            return NextResponse.json(
                {
                    error: "VALIDATION_ERROR",
                    message: "No speech detected in audio",
                },
                { status: 400 },
            );
        }

        const history = await getConversationHistory(activeSessionId, 20);
        const responseText = await retryWithBackoff(
            () => generateResponse(transcript, history),
            2,
        );
        const audio = await retryWithBackoff(
            () => synthesizeSpeech(responseText),
            2,
        );

        await saveMessage(activeSessionId, "user", transcript);
        await saveMessage(activeSessionId, "assistant", responseText);

        if (existsSync(preparedPath)) await unlink(preparedPath);
        if (existsSync(tmpPath) && tmpPath !== preparedPath)
            await unlink(tmpPath);

        return new NextResponse(audio, {
            headers: {
                "Content-Type": "audio/mpeg",
                "X-Session-Id": activeSessionId,
                "X-Transcript": transcript,
            },
        });
    } catch (error) {
        if (existsSync(tmpPath)) await unlink(tmpPath).catch(() => {});
        throw error;
    }
}

export async function POST(req: NextRequest) {
    return withAuth(req, handler);
}
```

**app/api/v1/sessions/route.ts** (create session):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { createSession } from "@/lib/conversation";

export async function POST(req: NextRequest) {
    return withAuth(req, async (_req, user) => {
        const sessionId = await createSession(user.id);
        return NextResponse.json({
            sessionId,
            createdAt: new Date().toISOString(),
        });
    });
}
```

**app/api/v1/sessions/[sessionId]/route.ts** (get session):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { getSession } from "@/lib/conversation";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    return withAuth(req, async (_req, user) => {
        const { sessionId } = await params;
        const session = await getSession(sessionId, user.id);
        if (!session) {
            return NextResponse.json(
                { error: "SESSION_NOT_FOUND", message: "Session not found" },
                { status: 404 },
            );
        }
        return NextResponse.json({
            session: {
                id: session._id.toString(),
                userId: session.userId.toString(),
                createdAt: session.createdAt,
                lastActivityAt: session.lastActivityAt,
            },
        });
    });
}
```

**app/api/v1/auth/login/route.ts**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/auth";

export async function POST(req: NextRequest) {
    const { apiKey } = await req.json();
    if (!apiKey) {
        return NextResponse.json(
            { error: "VALIDATION_ERROR", message: "API key is required" },
            { status: 400 },
        );
    }
    const user = await validateApiKey(apiKey);
    if (!user) {
        return NextResponse.json(
            { error: "INVALID_API_KEY", message: "Invalid API key" },
            { status: 401 },
        );
    }
    return NextResponse.json({
        token: apiKey,
        userId: user.id,
        email: user.email,
    });
}
```

**app/api/v1/sessions/[sessionId]/messages/route.ts**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-middleware";
import { getSession, getConversationHistory } from "@/lib/conversation";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> },
) {
    return withAuth(req, async (_req, user) => {
        const { sessionId } = await params;
        const session = await getSession(sessionId, user.id);
        if (!session) {
            return NextResponse.json(
                { error: "SESSION_NOT_FOUND", message: "Session not found" },
                { status: 404 },
            );
        }
        const limit = Math.min(
            parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20,
            100,
        );
        const messages = await getConversationHistory(sessionId, limit);
        return NextResponse.json({
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
        });
    });
}
```

### Step 5: Package.json Scripts

```json
{
    "scripts": {
        "dev": "next dev",
        "build": "next build",
        "start": "next start"
    }
}
```

### Step 6: Docker (V2)

**Dockerfile**:

```dockerfile
FROM node:18-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

**docker-compose.yml**:

```yaml
services:
    app:
        build: .
        ports:
            - "3000:3000"
        environment:
            - MONGODB_URI=mongodb://mongo:27017/voice_agent
            - OPENAI_API_KEY=${OPENAI_API_KEY}
            - NODE_ENV=production
        depends_on:
            - mongo
        restart: unless-stopped

    mongo:
        image: mongo:7
        ports:
            - "27017:27017"
        volumes:
            - mongo_data:/data/db
        restart: unless-stopped

volumes:
    mongo_data:
```

---

## End-to-End Verification

Same flow as MVP:

1. Start stack: `docker-compose up -d`
2. Register: `POST /api/v1/auth/register` with `{ "email": "test@example.com" }` → save `apiKey`
3. Create session: `POST /api/v1/sessions` with `Authorization: Bearer <apiKey>` → save `sessionId`
4. Voice: `POST /api/v1/voice/conversation` with Bearer, FormData `audio` and `sessionId` → receive MP3
5. History: `GET /api/v1/sessions/:sessionId/messages` with Bearer → `{ messages }`

Checklist: registration, auth, sessions, audio upload/transcription/LLM/TTS, message persistence, error handling (401, 400, 429, 500), and cleanup.

---

## Summary

**V2 architecture** uses **TypeScript**, **Next.js**, and **MongoDB** while keeping the same MVP behavior:

- ✅ TypeScript for types and safer refactors
- ✅ Next.js API routes for a single app and optional frontend
- ✅ MongoDB for users, sessions, and messages with simple documents and indexes
- ✅ Same capabilities: STT, TTS, LLM, auth, sessions, file upload, errors, and deployment

**Document Version**: V2  
**Last Updated**: January 28, 2026  
**Stack**: TypeScript, Next.js, MongoDB
