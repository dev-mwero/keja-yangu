import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { failPayout } from "@/lib/commission";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, type Role } from "@/lib/permissions";
import { User } from "@/models/User";

const failInput = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid payout id" }, { status: 400 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = failInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid failure payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const payout = await failPayout(
      { userId: String(user._id), role: user.role as Role },
      id,
      parsed.data.reason,
    );
    return NextResponse.json({ data: payout });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fail payout";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
