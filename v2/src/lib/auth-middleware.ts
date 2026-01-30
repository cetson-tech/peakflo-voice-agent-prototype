import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey, type AuthUser } from '@/lib/auth';

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /connection|ECONNREFUSED|ENOTFOUND|MongoServerSelectionError|MongoNetworkError/i.test(msg)
  );
}

export async function withAuth(
  req: NextRequest,
  handler: (req: NextRequest, user: AuthUser) => Promise<NextResponse>
): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
      },
      { status: 401 }
    );
  }
  const apiKey = authHeader.slice(7);
  try {
    const user = await validateApiKey(apiKey);
    if (!user) {
      return NextResponse.json(
        { error: 'INVALID_API_KEY', message: 'Invalid API key' },
        { status: 401 }
      );
    }
    return await handler(req, user);
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
        message: err instanceof Error ? err.message : 'Authentication failed',
      },
      { status: 500 }
    );
  }
}
