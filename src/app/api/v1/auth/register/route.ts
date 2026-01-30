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
        { error: "VALIDATION_ERROR", message: "Email and API key are both required" },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json(
        {
          exists: true,
          message: "Email already registered. Please log in with your API key.",
        },
        { status: 200 }
      );
    }

    const user = await User.create({
      email: email.toLowerCase(),
      apiKey,
    });

    logger.info("User registered", { userId: user._id, email });

    return NextResponse.json(
      {
        exists: false,
        userId: user._id.toString(),
        email: email.toLowerCase(),
        message: "Account created successfully. You can now use the voice agent.",
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
