import crypto from 'crypto';
import { getDb } from './db';

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export function generateApiKey(): string {
  return 'sk_' + crypto.randomBytes(32).toString('hex');
}

export interface AuthUser {
  id: string;
  email: string;
}

export async function validateApiKey(apiKey: string): Promise<AuthUser | null> {
  const hashedKey = hashApiKey(apiKey);
  const database = await getDb();
  const user = await database.collection('users').findOne({ apiKeyHash: hashedKey });
  if (!user) return null;
  return { id: user._id.toString(), email: user.email as string };
}

export async function createUser(
  email: string
): Promise<{ userId: string; apiKey: string }> {
  const apiKey = generateApiKey();
  const hashedKey = hashApiKey(apiKey);
  const database = await getDb();
  const result = await database.collection('users').insertOne({
    email,
    apiKeyHash: hashedKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { userId: result.insertedId.toString(), apiKey };
}
