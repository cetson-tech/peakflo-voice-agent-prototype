import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getSession } from "@/modules/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const authResult = await authenticate(req);
    if (authResult instanceof NextResponse) return authResult;
    const user = authResult;

    const { sessionId } = await params;
    const session = await getSession(sessionId, user.id);

    if (!session) {
      return NextResponse.json(
        { error: "SESSION_NOT_FOUND", message: "Session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}
