import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import logger from "@/lib/logger";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function getConversationHistory(
  sessionId: string,
  limit: number = 20
): Promise<ChatMessage[]> {
  await connectDB();
  try {
    const messages = await Message.find({ sessionId })
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Get conversation history error", { error: message });
    throw error;
  }
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  await connectDB();
  try {
    await Message.create({ sessionId, role, content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Save message error", { error: message });
    throw error;
  }
}
