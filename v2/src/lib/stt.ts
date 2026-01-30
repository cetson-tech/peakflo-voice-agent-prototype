import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Call Whisper API using axios + form-data (Node https stack).
 * Avoids 421 Misdirected Request that can occur with Node fetch/Undici (HTTP/1.1).
 */
export async function transcribeAudio(audioFilePath: string): Promise<string> {
  const form = new FormData();
  form.append('file', fs.createReadStream(audioFilePath), {
    filename: path.basename(audioFilePath) || 'audio.wav',
    contentType: 'audio/wav',
  });
  form.append('model', 'whisper-1');
  form.append('response_format', 'json');

  const response = await axios.post<{ text?: string }>(WHISPER_URL, form, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      ...form.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120_000,
    validateStatus: () => true,
  });

  if (response.status !== 200) {
    const msg =
      response.data && typeof response.data === 'object' && 'error' in response.data
        ? (response.data as { error?: { message?: string } }).error?.message
        : response.statusText;
    throw new Error(msg || `Whisper API error: ${response.status}`);
  }

  const text = response.data?.text;
  return typeof text === 'string' ? text : '';
}
