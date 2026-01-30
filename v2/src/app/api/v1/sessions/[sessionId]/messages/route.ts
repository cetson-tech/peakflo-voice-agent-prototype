import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { getSession, getConversationHistory } from '@/lib/conversation';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  return withAuth(req, async (request, user) => {
    const { sessionId } = await context.params;
    const session = await getSession(sessionId, user.id);
    if (!session) {
      return NextResponse.json(
        { error: 'SESSION_NOT_FOUND', message: 'Session not found' },
        { status: 404 }
      );
    }
    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(
      parseInt(limitParam ?? '20', 10) || 20,
      100
    );
    const messages = await getConversationHistory(sessionId, limit);
    return NextResponse.json({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  });
}
