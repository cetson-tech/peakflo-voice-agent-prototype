import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = body?.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'API key is required' },
        { status: 400 }
      );
    }
    const user = await validateApiKey(apiKey);
    if (!user) {
      return NextResponse.json(
        { error: 'INVALID_API_KEY', message: 'Invalid API key' },
        { status: 401 }
      );
    }
    return NextResponse.json({
      token: apiKey,
      userId: user.id,
      email: user.email,
    });
  } catch {
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: 'Authentication failed' },
      { status: 500 }
    );
  }
}
