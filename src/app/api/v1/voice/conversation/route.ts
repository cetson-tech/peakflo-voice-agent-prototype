import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { authenticate } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getOrCreateSession } from "@/modules/session";
import { validateAudio, prepareAudioForWhisper } from "@/modules/audio";
import { handleVoiceConversation } from "@/modules/voice";
import logger from "@/lib/logger";

const ALLOWED_TYPES = [
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/webm",
  "audio/ogg",
  "audio/flac",
  "audio/x-wav",
  "audio/wave",
];

export async function POST(req: NextRequest) {
  let audioFilePath: string | null = null;
  let preparedPath: string | null = null;

  try {
    // Authenticate
    const authResult = await authenticate(req);
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    // Parse multipart form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const sessionId = (formData.get("sessionId") as string) || null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Audio file is required" },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_TYPES.includes(audioFile.type)) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message:
            "Invalid audio format. Supported: WAV, MP3, WebM, OGG, FLAC",
        },
        { status: 400 }
      );
    }

    // Validate file size (25MB)
    const maxSize =
      (parseInt(process.env.MAX_AUDIO_SIZE_MB || "25") || 25) * 1024 * 1024;
    if (audioFile.size > maxSize) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: `Audio file too large. Maximum: ${process.env.MAX_AUDIO_SIZE_MB || 25}MB`,
        },
        { status: 400 }
      );
    }

    logger.info("Voice conversation request", {
      userId: user.id,
      sessionId,
      fileSize: audioFile.size,
      mimetype: audioFile.type,
    });

    // Save file to disk temporarily
    const uploadsDir = path.join(process.cwd(), "uploads");
    const fileName = `${randomUUID()}-${audioFile.name || "audio"}`;
    audioFilePath = path.join(uploadsDir, fileName);

    const bytes = await audioFile.arrayBuffer();
    await writeFile(audioFilePath, Buffer.from(bytes));

    // Validate audio
    const validation = await validateAudio(audioFilePath);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: validation.error },
        { status: 400 }
      );
    }

    // Get or create session
    const activeSessionId = await getOrCreateSession(user.id, sessionId);

    // Prepare audio for Whisper
    preparedPath = await prepareAudioForWhisper(audioFilePath);

    // Process voice conversation
    const result = await handleVoiceConversation({
      userId: user.id,
      sessionId: activeSessionId,
      audioFilePath: preparedPath,
    });

    // Cleanup temporary files
    await cleanupFile(preparedPath);
    if (preparedPath !== audioFilePath) {
      await cleanupFile(audioFilePath);
    }

    logger.info("Voice conversation completed", {
      userId: user.id,
      sessionId: activeSessionId,
      transcriptLength: result.transcript.length,
      responseLength: result.response.length,
    });

    // Return audio response
    return new NextResponse(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Session-Id": activeSessionId,
        "X-Transcript": encodeURIComponent(result.transcript),
        "X-Response-Text": encodeURIComponent(result.response),
      },
    });
  } catch (error) {
    // Cleanup on error
    if (preparedPath) await cleanupFile(preparedPath);
    if (audioFilePath && audioFilePath !== preparedPath)
      await cleanupFile(audioFilePath);

    return handleApiError(error);
  }
}

async function cleanupFile(filePath: string | null): Promise<void> {
  if (filePath && existsSync(filePath)) {
    try {
      await unlink(filePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}
