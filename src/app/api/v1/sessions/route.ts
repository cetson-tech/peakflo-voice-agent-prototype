import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { createSession } from "@/modules/session";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const authResult = await authenticate(req);
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    const sessionId = await createSession(user.id);

    logger.info("Session created", { sessionId, userId: user.id });

    return NextResponse.json(
      {
        sessionId,
        createdAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
