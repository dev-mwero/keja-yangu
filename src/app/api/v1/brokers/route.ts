import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { BrokerProfile } from "@/models/BrokerProfile";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" && user.role !== "owner" && user.role !== "system-admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const statusParam = request.nextUrl.searchParams.get("status");
  const query: Record<string, any> = {};
  if (statusParam) {
    query.status = statusParam;
  }

  const [total, profiles] = await Promise.all([
    BrokerProfile.countDocuments(query),
    BrokerProfile.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  return NextResponse.json({
    brokers: profiles,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
}

