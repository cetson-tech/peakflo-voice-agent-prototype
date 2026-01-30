import { connectDB } from "@/lib/mongodb";
import Session from "@/models/Session";
import logger from "@/lib/logger";

export async function createSession(userId: string): Promise<string> {
  await connectDB();
  try {
    const session = await Session.create({ userId });
    return session._id.toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Create session error", { error: message });
    throw error;
  }
}

export async function getSession(
  sessionId: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  await connectDB();
  try {
    const session = await Session.findOne({
      _id: sessionId,
      userId: userId,
    }).lean();
    return session as Record<string, unknown> | null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Get session error", { error: message });
    throw error;
  }
}

export async function getOrCreateSession(
  userId: string,
  sessionId: string | null = null
): Promise<string> {
  await connectDB();
  try {
    if (sessionId) {
      const session = await getSession(sessionId, userId);
      if (session) {
        await Session.findByIdAndUpdate(sessionId, {
          lastActivityAt: new Date(),
        });
        return sessionId;
      }
    }
    return await createSession(userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Get or create session error", { error: message });
    throw error;
  }
}
