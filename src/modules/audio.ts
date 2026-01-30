import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import logger from "@/lib/logger";

const execPromise = promisify(exec);

interface AudioValidationResult {
  valid: boolean;
  duration?: number;
  size?: number;
  error?: string;
}

export async function validateAudio(
  filePath: string
): Promise<AudioValidationResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: "Audio file not found" };
    }

    const stats = fs.statSync(filePath);
    const maxSize =
      (parseInt(process.env.MAX_AUDIO_SIZE_MB || "25") || 25) * 1024 * 1024;

    if (stats.size > maxSize) {
      return {
        valid: false,
        error: `Audio file too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum: ${process.env.MAX_AUDIO_SIZE_MB || 25}MB`,
      };
    }

    // Try to get duration using ffprobe
    try {
      const { stdout } = await execPromise(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
      );

      const duration = parseFloat(stdout.trim());
      const maxDuration = parseInt(
        process.env.MAX_AUDIO_DURATION_SECONDS || "300"
      );

      if (!isNaN(duration) && duration > maxDuration) {
        return {
          valid: false,
          error: `Audio duration too long (${Math.round(duration)}s). Maximum: ${maxDuration}s`,
        };
      }

      return { valid: true, duration, size: stats.size };
    } catch {
      // ffprobe not available - skip duration check, still valid
      logger.warn(
        "ffprobe not available, skipping duration check"
      );
      return { valid: true, size: stats.size };
    }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function prepareAudioForWhisper(
  inputPath: string
): Promise<string> {
  const outputPath = inputPath + ".wav";

  try {
    // Try to convert to WAV, 16kHz, mono (optimal for Whisper)
    await execPromise(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -f wav "${outputPath}" -y`
    );

    // Clean up original
    if (inputPath !== outputPath && fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }

    return outputPath;
  } catch {
    // ffmpeg not available - use original file directly
    logger.warn(
      "ffmpeg not available, using original audio file"
    );
    return inputPath;
  }
}
