import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { createSession } from '@/lib/conversation';

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /connection|ECONNREFUSED|ENOTFOUND|MongoServerSelectionError|MongoNetworkError/i.test(msg)
  );
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (_req, user) => {
    try {
      const sessionId = await createSession(user.id);
      return NextResponse.json({
        sessionId,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      if (isConnectionError(err)) {
        return NextResponse.json(
          {
            error: 'SERVICE_UNAVAILABLE',
            message: 'Database connection failed. Check that MongoDB is running and MONGODB_URI is set in .env.local.',
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error: 'INTERNAL_SERVER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to create session',
        },
        { status: 500 }
      );
    }
  });
}
