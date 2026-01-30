import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getSession } from '@/lib/conversation';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  return withAuth(req, async (_req, user) => {
    const { sessionId } = await context.params;
    const session = await getSession(sessionId, user.id);
    if (!session) {
      return NextResponse.json(
        { error: 'SESSION_NOT_FOUND', message: 'Session not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({
      session: {
        id: session._id.toString(),
        userId: session.userId,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      },
    });
  });
}
