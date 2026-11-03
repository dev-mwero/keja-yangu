import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPayoutBatch } from "@/lib/commission";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, type Role } from "@/lib/permissions";
import { CommissionPayout } from "@/models/CommissionPayout";
import { User } from "@/models/User";

const createInput = z.object({
  brokerUserId: z.string().trim().min(1),
  accrualIds: z.array(z.string().trim().min(1)).optional(),
});

async function requireSystemAdmin(
  request: NextRequest,
): Promise<NextResponse | { user: { _id: unknown; role: string } }> {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const guard = await requireSystemAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const status = request.nextUrl.searchParams.get("status");
  if (status) filter.status = status;
  const brokerUserId = request.nextUrl.searchParams.get("brokerUserId");
  if (brokerUserId) filter.brokerUserId = brokerUserId;

  const [items, total] = await Promise.all([
    CommissionPayout.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CommissionPayout.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(items, total, page, limit));
}

export async function POST(request: NextRequest) {
  const guard = await requireSystemAdmin(request);
  if (guard instanceof NextResponse) return guard;

  const body = await request.json().catch(() => null);
  const parsed = createInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payout payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const payout = await createPayoutBatch(
      { userId: String(guard.user._id), role: guard.user.role as Role },
      parsed.data.brokerUserId,
      parsed.data.accrualIds,
    );
    return NextResponse.json({ data: payout }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create payout";
    const status = message.includes("No approved") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
