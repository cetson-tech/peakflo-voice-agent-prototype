import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import { withAuth } from '@/lib/auth-middleware';
import { getOrCreateSession, getConversationHistory, saveMessage } from '@/lib/conversation';
import { validateAudio, prepareAudioForWhisper } from '@/lib/audio';
import { transcribeAudio } from '@/lib/stt';
import { synthesizeSpeech } from '@/lib/tts';
import { generateResponse } from '@/lib/llm';
import { retryWithBackoff } from '@/lib/errors';

async function handleConversation(req: NextRequest, user: { id: string }) {
  const formData = await req.formData();
  const audioFile = formData.get('audio') as File | null;
  const sessionId = (formData.get('sessionId') as string) || null;

  if (!audioFile?.size) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'Audio file is required' },
      { status: 400 }
    );
  }

  const tmpDir = os.tmpdir();
  const safeName = (audioFile.name ?? 'audio').replace(/[^\w.-]/g, '_').slice(0, 50) || 'audio';
  const tmpPath = path.join(tmpDir, `voice-${Date.now()}-${safeName}`);

  try {
    const bytes = await audioFile.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    const validation = await validateAudio(tmpPath);
    if (!validation.valid) {
      await unlink(tmpPath).catch(() => {});
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: validation.error },
        { status: 400 }
      );
    }

    const activeSessionId = await getOrCreateSession(user.id, sessionId);
    let preparedPath: string;
    try {
      preparedPath = await prepareAudioForWhisper(tmpPath);
      console.log('[voice] Audio prepared for Whisper');
    } catch (e) {
      await unlink(tmpPath).catch(() => {});
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: e instanceof Error ? e.message : 'Audio conversion failed',
        },
        { status: 400 }
      );
    }

    let transcript: string;
    try {
      transcript = await retryWithBackoff(() => transcribeAudio(preparedPath), 2);
      console.log('[voice] STT done:', transcript?.slice(0, 60) + (transcript?.length > 60 ? '...' : ''));
    } finally {
      await unlink(preparedPath).catch(() => {});
    }

    if (!transcript?.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'No speech detected in audio' },
        { status: 400 }
      );
    }

    const history = await getConversationHistory(activeSessionId, 20);
    const responseText = await retryWithBackoff(
      () => generateResponse(transcript, history),
      2
    );
    console.log('[voice] LLM done');
    const audio = await retryWithBackoff(() => synthesizeSpeech(responseText), 2);
    console.log('[voice] TTS done');

    await saveMessage(activeSessionId, 'user', transcript);
    await saveMessage(activeSessionId, 'assistant', responseText);

    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'X-Session-Id': activeSessionId,
        'X-Transcript': transcript,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Voice conversation failed';
    const status =
      message.includes('rate') || (error as { status?: number })?.status === 429
        ? 429
        : 500;
    // Log full error so you can see the cause in the terminal
    console.error('[voice/conversation] Error:', error instanceof Error ? error.stack : error);
    return NextResponse.json(
      {
        error: status === 429 ? 'RATE_LIMIT_EXCEEDED' : 'INTERNAL_SERVER_ERROR',
        message,
      },
      { status }
    );
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export async function POST(req: NextRequest) {
  return withAuth(req, handleConversation);
}
