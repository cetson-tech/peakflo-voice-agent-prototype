import { NextResponse } from 'next/server';

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 2
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status != null && status < 500) throw error;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }
  throw lastError;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}
