import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const ALLOWED_MIMES = [
  'audio/wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/x-wav',
  'audio/wave',
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
    return { valid: false, error: 'Audio file not found' };
  }
  const stats = fs.statSync(filePath);
  const maxSize = 25 * 1024 * 1024;
  if (stats.size > maxSize) {
    return { valid: false, error: 'Audio file too large (max 25MB)' };
  }
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath.replace(/"/g, '\\"')}"`
    );
    const duration = parseFloat(stdout.trim());
    if (Number.isNaN(duration) || duration > 300) {
      return {
        valid: false,
        error: 'Audio duration too long (max 5 minutes)',
      };
    }
    return { valid: true, duration, size: stats.size };
  } catch {
    return {
      valid: false,
      error: 'Invalid audio file or format not supported',
    };
  }
}

export async function prepareAudioForWhisper(inputPath: string): Promise<string> {
  const outputPath = inputPath + '.wav';
  await execPromise(
    `ffmpeg -i "${inputPath.replace(/"/g, '\\"')}" -ar 16000 -ac 1 -f wav "${outputPath.replace(/"/g, '\\"')}" -y`
  );
  if (inputPath !== outputPath && fs.existsSync(inputPath)) {
    fs.unlinkSync(inputPath);
  }
  return outputPath;
}
