import openai from "@/lib/openai";
import logger from "@/lib/logger";

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  try {
    if (!text || text.trim().length === 0) {
      throw new Error("Text is required for TTS");
    }

    if (text.length > 4096) {
      throw new Error(
        `Text exceeds 4096 character limit (${text.length} chars)`
      );
    }

    const response = await openai.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: text,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("TTS error", { error: message });
    throw new Error(`TTS failed: ${message}`);
  }
}
