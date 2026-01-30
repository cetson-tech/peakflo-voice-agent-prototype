import openai from "@/lib/openai";
import logger from "@/lib/logger";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function generateResponse(
  userText: string,
  conversationHistory: ChatMessage[]
): Promise<string> {
  try {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a helpful voice assistant. Keep responses concise and natural for voice conversation. Maximum 2-3 sentences.",
      },
    ];

    // Add conversation history (last 10 messages)
    const recentHistory = conversationHistory.slice(-10);
    messages.push(...recentHistory);

    // Add current user message
    messages.push({ role: "user", content: userText });

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const responseText = response.choices[0].message.content;
    if (!responseText) {
      throw new Error("Empty response from LLM");
    }

    return responseText;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("LLM error", { error: message });
    throw new Error(`LLM failed: ${message}`);
  }
}
