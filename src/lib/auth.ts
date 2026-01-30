import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "./mongodb";
import User from "@/models/User";
import logger from "./logger";

export async function validateApiKey(
  apiKey: string
): Promise<{ id: string; email: string } | null> {
  await connectDB();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = await User.findOne({ apiKey }).lean();

  if (!user) {
    return null;
  }

  return {
    id: String(user._id),
    email: user.email,
  };
}

export async function authenticate(
  req: NextRequest
): Promise<{ id: string; email: string } | NextResponse> {
  const authHeader = req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error: "UNAUTHORIZED",
        message:
          "Missing or invalid authorization header. Use: Authorization: Bearer <api-key>",
      },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);

  try {
    const user = await validateApiKey(apiKey);

    if (!user) {
      return NextResponse.json(
        { error: "INVALID_API_KEY", message: "Invalid API key" },
        { status: 401 }
      );
    }

    return user;
  } catch (error) {
    logger.error("Authentication error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "AUTHENTICATION_ERROR", message: "Authentication failed" },
      { status: 500 }
    );
  }
}
