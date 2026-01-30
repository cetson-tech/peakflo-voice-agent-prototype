import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { handleApiError } from "@/lib/errors";
import User from "@/models/User";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = await req.json();
    const { email, apiKey } = body;

    if (!email || !apiKey) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Email and API key are both required",
        },
        { status: 400 }
      );
    }

    // Find user by email
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = await User.findOne({
      email: email.toLowerCase(),
    }).lean();

    if (!user) {
      return NextResponse.json(
        {
          error: "USER_NOT_FOUND",
          message: "No account found with this email. Please register first.",
        },
        { status: 404 }
      );
    }

    // Verify API key matches (plain text)
    if (user.apiKey !== apiKey) {
      logger.warn("Login failed: invalid API key", {
        email: email.toLowerCase(),
        userId: user._id,
      });
      return NextResponse.json(
        {
          error: "INVALID_API_KEY",
          message: "Invalid API key for this email.",
        },
        { status: 401 }
      );
    }

    logger.info("User logged in", {
      userId: user._id,
      email: user.email,
    });

    return NextResponse.json({
      token: apiKey,
      userId: String(user._id),
      email: user.email,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
