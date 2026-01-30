import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI ?? '';
let client: MongoClient | null = null;
let db: Db | null = null;
let indexesEnsured = false;

async function ensureIndexes(database: Db): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    await database.collection('users').createIndex({ apiKeyHash: 1 });
    await database.collection('users').createIndex({ email: 1 }, { unique: true });
    await database.collection('sessions').createIndex({ userId: 1 });
    await database.collection('sessions').createIndex({ lastActivityAt: 1 });
    await database.collection('messages').createIndex({ sessionId: 1 });
    await database.collection('messages').createIndex({ sessionId: 1, createdAt: 1 });
  } catch {
    // Ignore if indexes already exist or DB is read-only
  }
}

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (!uri) throw new Error('MONGODB_URI is not set');
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();
  await ensureIndexes(db);
  return db;
}
