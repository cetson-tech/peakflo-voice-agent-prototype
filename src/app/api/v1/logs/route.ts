import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") || "combined";
    const lines = parseInt(req.nextUrl.searchParams.get("lines") || "50");

    const logFile =
      type === "error" ? "error.log" : "combined.log";
    const logPath = path.join(process.cwd(), "logs", logFile);

    if (!existsSync(logPath)) {
      return NextResponse.json({ logs: [], message: "No logs yet" });
    }

    const content = await readFile(logPath, "utf-8");
    const allLines = content.trim().split("\n").filter(Boolean);

    // Return the last N lines, parsed as JSON
    const recentLines = allLines.slice(-lines);
    const logs = recentLines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return { message: line, level: "info" };
        }
      })
      .reverse(); // newest first

    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json(
      {
        error: "LOGS_ERROR",
        message: error instanceof Error ? error.message : "Failed to read logs",
      },
      { status: 500 }
    );
  }
}
