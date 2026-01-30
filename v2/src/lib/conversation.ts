import { getDb } from './db';
import { ObjectId } from 'mongodb';

export async function createSession(userId: string): Promise<string> {
  const database = await getDb();
  const result = await database.collection('sessions').insertOne({
    userId,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    metadata: {},
  });
  return result.insertedId.toString();
}

export interface SessionDoc {
  _id: ObjectId;
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  metadata?: Record<string, unknown>;
}

export async function getSession(
  sessionId: string,
  userId: string
): Promise<SessionDoc | null> {
  const database = await getDb();
  let oid: ObjectId;
  try {
    oid = new ObjectId(sessionId);
  } catch {
    return null;
  }
  const session = await database.collection<SessionDoc>('sessions').findOne({
    _id: oid,
    userId,
  });
  return session ?? null;
}

export async function getOrCreateSession(
  userId: string,
  sessionId: string | null
): Promise<string> {
  if (sessionId) {
    const session = await getSession(sessionId, userId);
    if (session) {
      const database = await getDb();
      await database
        .collection('sessions')
        .updateOne(
          { _id: session._id },
          { $set: { lastActivityAt: new Date() } }
        );
      return sessionId;
    }
  }
  return createSession(userId);
}

export async function getConversationHistory(
  sessionId: string,
  limit = 20
): Promise<{ role: string; content: string }[]> {
  const database = await getDb();
  let oid: ObjectId;
  try {
    oid = new ObjectId(sessionId);
  } catch {
    return [];
  }
  const messages = await database
    .collection('messages')
    .find({ sessionId: oid })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();
  return messages.map((m) => ({ role: m.role as string, content: m.content as string }));
}

export async function saveMessage(
  sessionId: string,
  role: string,
  content: string
): Promise<void> {
  const database = await getDb();
  const oid = new ObjectId(sessionId);
  await database.collection('messages').insertOne({
    sessionId: oid,
    role,
    content,
    createdAt: new Date(),
  });
}
