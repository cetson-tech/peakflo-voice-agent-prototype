import { transcribeAudio } from "./stt";
import { synthesizeSpeech } from "./tts";
import { generateResponse } from "./llm";
import { getConversationHistory, saveMessage } from "./conversation";
import { retryWithBackoff } from "@/lib/errors";
import logger from "@/lib/logger";

interface VoiceConversationParams {
  userId: string;
  sessionId: string;
  audioFilePath: string;
}

interface VoiceConversationResult {
  audio: Buffer;
  transcript: string;
  response: string;
}

export async function handleVoiceConversation({
  sessionId,
  audioFilePath,
}: VoiceConversationParams): Promise<VoiceConversationResult> {
  try {
    // 1. Transcribe audio (with retry)
    logger.info("Transcribing audio", { sessionId });
    const transcript = await retryWithBackoff(
      () => transcribeAudio(audioFilePath),
      2
    );

    if (!transcript || transcript.trim().length === 0) {
      throw new Error("No speech detected in audio");
    }

    logger.info("Transcription complete", { sessionId, transcript });

    // 2. Get conversation history
    const history = await getConversationHistory(sessionId, 20);

    // 3. Generate response (with retry)
    logger.info("Generating response", { sessionId });
    const responseText = await retryWithBackoff(
      () => generateResponse(transcript, history),
      2
    );

    logger.info("Response generated", {
      sessionId,
      responseLength: responseText.length,
    });

    // 4. Synthesize speech (with retry)
    logger.info("Synthesizing speech", { sessionId });
    const audio = await retryWithBackoff(
      () => synthesizeSpeech(responseText),
      2
    );

    logger.info("Speech synthesized", { sessionId, audioSize: audio.length });

    // 5. Save messages to database
    await saveMessage(sessionId, "user", transcript);
    await saveMessage(sessionId, "assistant", responseText);

    return {
      audio,
      transcript,
      response: responseText,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Voice conversation error", {
      sessionId,
      error: message,
    });
    throw error;
  }
}
