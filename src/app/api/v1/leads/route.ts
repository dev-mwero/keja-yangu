import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getManagedOwnerId } from "@/lib/managed-owner";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, getAdminAssignmentScope, requirePermission } from "@/lib/permissions";
import { leadInput } from "@/lib/schemas";
import { Lead } from "@/models/Lead";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const status = request.nextUrl.searchParams.get("status");

  const authError = await requirePermission(request, "lead:read");
  if (authError) return authError;

  await connectToDatabase();
  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findById(authUser.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const managedOwnerId =
    user.role === "custodian" || user.role === "caretaker"
      ? await getManagedOwnerId(String(user._id))
      : "";

  const filter: Record<string, unknown> = {};
  if (user.role === "custodian") {
    if (!managedOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = managedOwnerId;
  } else if (user.role === "caretaker") {
    if (!managedOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = managedOwnerId;
  } else if (user.role === "admin") {
    const scope = await getAdminAssignmentScope(authUser.userId, "lead:read");
    const scopes: Record<string, unknown>[] = [];
    if (scope.propertyScopeIds.length > 0) {
      scopes.push({ propertyId: { $in: scope.propertyScopeIds } });
    }
    if (scope.assignedUnitIds.length > 0) {
      scopes.push({ unitId: { $in: scope.assignedUnitIds } });
    }
    if (scopes.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.$or = scopes;
  } else if (user.role === "system-admin") {
    // no filter — sees every portfolio's leads
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (status) filter.status = status;

  const [leads, total] = await Promise.all([
    Lead.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Lead.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(leads, total, page, limit));
}

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "lead:manage");
  if (authError) return authError;

  const body = await request.json();
  const parsed = leadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid lead payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findById(authUser.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const managedOwnerId =
    user.role === "custodian" || user.role === "caretaker"
      ? await getManagedOwnerId(String(user._id))
      : "";

  let ownerId: string;
  if (user.role === "system-admin") {
    ownerId = authUser.userId;
  } else if (user.role === "custodian") {
    if (!managedOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    ownerId = managedOwnerId;
  } else if (user.role === "caretaker") {
    if (!managedOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    ownerId = managedOwnerId;
  } else if (user.role === "admin") {
    ownerId = authUser.userId;
    if (parsed.data.propertyId || parsed.data.unitId) {
      const scope = await getAdminAssignmentScope(authUser.userId, "lead:manage");
      const coversProperty =
        parsed.data.propertyId && scope.propertyScopeIds.includes(parsed.data.propertyId);
      const coversUnit = parsed.data.unitId && scope.assignedUnitIds.includes(parsed.data.unitId);
      if (!coversProperty && !coversUnit) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lead = await Lead.create({
    ...parsed.data,
    ownerId,
    createdBy: authUser.userId,
    email: parsed.data.email ?? "",
    propertyId: parsed.data.propertyId ?? "",
    unitId: parsed.data.unitId ?? "",
    source: parsed.data.source ?? "",
    notes: parsed.data.notes ?? "",
    status: parsed.data.status ?? "new",
  });

  return NextResponse.json({ data: lead }, { status: 201 });
}
