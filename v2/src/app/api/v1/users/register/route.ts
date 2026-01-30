import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = body?.email;
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Email is required' },
        { status: 400 }
      );
    }
    const { userId, apiKey } = await createUser(email);
    return NextResponse.json({
      userId,
      apiKey,
      message:
        'API key created. Save this key securely - it will not be shown again.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    if (message.includes('duplicate') || message.includes('E11000')) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Email already registered' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message },
      { status: 500 }
    );
  }
}
