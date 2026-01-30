import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function synthesizeSpeech(text: string): Promise<Buffer> {
  if (text.length > 4096) {
    throw new Error('Text exceeds 4096 character limit');
  }
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: text,
  });
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
