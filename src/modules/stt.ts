import fs from "fs";
import openai from "@/lib/openai";
import logger from "@/lib/logger";

export async function transcribeAudio(audioFilePath: string): Promise<string> {
  try {
    const file = fs.createReadStream(audioFilePath);

    logger.info("STT: Sending audio to Whisper API", {
      filePath: audioFilePath,
    });

    const transcript = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      response_format: "json",
    });

    logger.info("STT: Transcription received", {
      textLength: transcript.text.length,
    });

    return transcript.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isTimeout =
      message.includes("timeout") || message.includes("Connection error");
    logger.error("STT error", {
      error: message,
      isTimeout,
    });
    throw new Error(
      isTimeout
        ? "STT timed out — please try speaking again"
        : `STT failed: ${message}`
    );
  }
}
