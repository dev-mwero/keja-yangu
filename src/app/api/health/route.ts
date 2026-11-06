import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";

export async function GET() {
  try {
    await connectToDatabase();
    const dbState = mongoose.connection.readyState; // 1 = connected
    if (dbState !== 1) {
      return NextResponse.json({ status: "degraded", db: "disconnected" }, { status: 503 });
    }
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (err) {
    return NextResponse.json(
      { status: "error", db: "unreachable", error: (err as Error)?.message },
      { status: 503 },
    );
  }
}
