import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { BrokerProfile } from "@/models/BrokerProfile";
import { CommissionAccrual } from "@/models/CommissionAccrual";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive || user.role !== "broker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await BrokerProfile.findOne({ userId: auth.userId }).select("status").lean();
  if (!profile || profile.status !== "verified") {
    return NextResponse.json(
      { error: "Forbidden: Verified broker profile required" },
      { status: 403 },
    );
  }

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { brokerUserId: auth.userId };
  const status = request.nextUrl.searchParams.get("status");
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    CommissionAccrual.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CommissionAccrual.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(items, total, page, limit));
}
