import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { terminateCommissionAgreement } from "@/lib/brokers";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { User } from "@/models/User";

const terminateSchema = z.object({
  reason: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive || (user.role !== "admin" && user.role !== "system-admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = terminateSchema.safeParse(body);
    const reason = parsed.success ? parsed.data.reason : undefined;

    const updated = await terminateCommissionAgreement(
      { userId: auth.userId, role: user.role },
      id,
      reason,
    );

    return NextResponse.json({ agreement: updated });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to terminate agreement" },
      { status: 400 },
    );
  }
}
