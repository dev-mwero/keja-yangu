import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAttributionDispute } from "@/lib/attributions";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, type Role } from "@/lib/permissions";
import { User } from "@/models/User";

const disputeInput = z.object({
  reason: z.string().trim().min(1).max(1000),
  newBrokerUserId: z.string().trim().min(1).optional(),
  newAgreementId: z.string().trim().min(1).optional(),
  newSource: z.enum(["broker", "direct", "platform", "admin"]).optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid attribution id" }, { status: 400 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = disputeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid dispute payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await resolveAttributionDispute(
      { userId: String(user._id), role: user.role as Role },
      id,
      parsed.data,
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve dispute";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
