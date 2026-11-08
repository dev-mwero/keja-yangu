import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bindApplicationAttribution } from "@/lib/attributions";
import { getAssignedPropertyIds, getManagedOwnerId } from "@/lib/managed-owner";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, getAdminAssignmentScope } from "@/lib/permissions";
import { applicationCreateInput } from "@/lib/schemas/application";
import { Application } from "@/models/Application";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const role = user.role;
  if (role === "tenant") {
    filter.applicantUserId = String(user._id);
  } else if (role === "owner") {
    filter.ownerId = String(user._id);
  } else if (role === "custodian") {
    const managedOwnerId = await getManagedOwnerId(String(user._id));
    if (!managedOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    filter.ownerId = managedOwnerId;
  } else if (role === "caretaker") {
    const managedOwnerId = await getManagedOwnerId(String(user._id));
    if (!managedOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    filter.ownerId = managedOwnerId;
    filter.propertyId = {
      $in: await getAssignedPropertyIds(String(user._id), "caretaker"),
    };
  } else if (role === "admin") {
    const scope = await getAdminAssignmentScope(String(user._id), "application:manage");
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
  } else if (role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Application.countDocuments(filter),
  ]);

  // Resolve property titles so the dashboard table reads without a join.
  const propertyIds = [...new Set(items.map((a) => String(a.propertyId)).filter(Boolean))];
  const properties = propertyIds.length
    ? await Property.find({ _id: { $in: propertyIds } })
        .select("title")
        .lean()
    : [];
  const propertyTitleById = new Map(properties.map((p) => [String(p._id), String(p.title ?? "")]));

  // Resolve requested unit names so the table can show which unit was asked for.
  const unitIds = [...new Set(items.map((a) => String(a.unitId ?? "")).filter(Boolean))];
  const units = unitIds.length
    ? await Unit.find({ _id: { $in: unitIds } })
        .select("name")
        .lean()
    : [];
  const unitNameById = new Map(units.map((u) => [String(u._id), String(u.name ?? "")]));

  const enriched = items.map((a) => ({
    ...a,
    propertyTitle: propertyTitleById.get(String(a.propertyId)) ?? "",
    unitName: unitNameById.get(String(a.unitId ?? "")) ?? "",
  }));

  return NextResponse.json(buildPaginationResult(enriched, total, page, limit));
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = applicationCreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid application payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive email").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "tenant") {
    return NextResponse.json({ error: "Only tenants can apply for a home" }, { status: 403 });
  }

  const property = await Property.findById(parsed.data.propertyId)
    .select("_id ownerId published status")
    .lean();
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  if (!property.published || property.status !== "available") {
    return NextResponse.json({ error: "This home is not accepting applications" }, { status: 409 });
  }

  const unitId = parsed.data.unitId ?? "";
  if (unitId) {
    const unit = await Unit.findById(unitId).select("_id propertyId status").lean();
    if (!unit) return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    if (String(unit.propertyId) !== parsed.data.propertyId) {
      return NextResponse.json(
        { error: "That unit is not part of this property" },
        { status: 400 },
      );
    }
    if (unit.status !== "available") {
      return NextResponse.json({ error: "That unit is no longer available" }, { status: 409 });
    }
  }

  const applicantUserId = String(user._id);
  const existing = await Application.findOne({
    propertyId: parsed.data.propertyId,
    applicantUserId,
    status: "pending",
  })
    .select("_id")
    .lean();
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending application for this home" },
      { status: 409 },
    );
  }

  const created = await Application.create({
    propertyId: parsed.data.propertyId,
    unitId,
    ownerId: property.ownerId,
    applicantUserId,
    applicantName: parsed.data.name,
    applicantEmail: parsed.data.email.trim().toLowerCase(),
    message: parsed.data.message ?? "",
    status: "pending",
  });

  // Lock the sourcing attribution before responding. Non-fatal: a failed
  // attribution lookup must not discard an otherwise valid application.
  if (unitId) {
    const { shareCode, touchToken, listingId } = parsed.data;
    try {
      await bindApplicationAttribution({
        applicationId: String(created._id),
        shareCode: shareCode || undefined,
        touchToken: touchToken || undefined,
        unitId,
        propertyId: parsed.data.propertyId,
        listingId: listingId || undefined,
        actorUserId: auth.userId,
      });
    } catch {
      // Non-fatal attribution bookkeeping
    }
  }

  return NextResponse.json({ data: created }, { status: 201 });
}
