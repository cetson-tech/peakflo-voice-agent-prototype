import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function generateResponse(
  userText: string,
  conversationHistory: ChatMessage[]
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content:
        'You are a helpful voice assistant. Keep responses concise and natural for voice conversation.',
    },
    ...conversationHistory
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userText },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 500,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content ?? '';
}
