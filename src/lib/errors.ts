import { NextResponse } from "next/server";
import logger from "./logger";

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 1
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = 500; // Fast retry - 500ms
        logger.warn(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`,
          { error: lastError.message }
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export function handleApiError(error: unknown): NextResponse {
  const err = error instanceof Error ? error : new Error(String(error));

  logger.error("API Error", {
    error: err.message,
    stack: err.stack,
  });

  // OpenAI API errors
  const apiError = error as { status?: number; message?: string };
  if (apiError.status) {
    if (apiError.status === 429) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "API rate limit exceeded. Please try again later.",
        },
        { status: 429 }
      );
    }
    if (apiError.status === 401) {
      return NextResponse.json(
        { error: "INVALID_OPENAI_KEY", message: "Invalid OpenAI API key configured on server" },
        { status: 500 }
      );
    }
  }

  // Connection/timeout errors
  if (
    err.message.includes("Connection error") ||
    err.message.includes("timeout") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ETIMEDOUT")
  ) {
    return NextResponse.json(
      {
        error: "CONNECTION_ERROR",
        message: "Failed to connect to AI service. Please try again.",
      },
      { status: 502 }
    );
  }

  // Validation errors
  if (
    err.message.includes("Invalid") ||
    err.message.includes("required") ||
    err.message.includes("exceeds")
  ) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: err.message },
      { status: 400 }
    );
  }

  // Default
  return NextResponse.json(
    {
      error: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "development"
          ? err.message
          : "An internal server error occurred",
    },
    { status: 500 }
  );
}
