import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, getAdminAssignmentScope } from "@/lib/permissions";
import { CommissionAccrual } from "@/models/CommissionAccrual";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  if (user.role === "admin") {
    const scope = await getAdminAssignmentScope(String(user._id), "application:manage");
    const scopes: Record<string, unknown>[] = [];
    if (scope.propertyScopeIds.length > 0) {
      scopes.push({ propertyId: { $in: scope.propertyScopeIds } });
    }
    const assignedUnitIds = scope.assignedUnitIds ?? [];
    if (assignedUnitIds.length > 0) {
      scopes.push({ unitId: { $in: assignedUnitIds } });
    }
    if (scopes.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopes;
  }

  const [items, total] = await Promise.all([
    CommissionAccrual.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    CommissionAccrual.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(items, total, page, limit));
}
