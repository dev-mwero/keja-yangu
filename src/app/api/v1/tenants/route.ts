import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInviteEmail } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { getTenantScope, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { MoveRequest } from "@/models/MoveRequest";
import { Property } from "@/models/Property";
import { TENANT_SAFE_FIELDS, Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

interface UnitHint {
  _id: string;
  name: string;
  blockName: string;
  propertyId: string;
}

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/**
 * Attach each tenant's currently-occupied unit and the unit they most
 * recently requested (pending move-in). The `userId` column is selected only
 * to join, then stripped from the response.
 */
async function attachUnitHints<T extends { userId?: string; _id?: unknown }>(rows: T[]) {
  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => !!v))];
  const tenantObjectIds = [
    ...new Set(rows.map((r) => String(r._id ?? "")).filter((id) => id && OBJECT_ID.test(id))),
  ];
  const occupiedByUser = new Map<string, UnitHint>();
  const requestedByTenant = new Map<string, string>();
  const nameByUnitId = new Map<string, { name: string; blockName: string }>();

  if (userIds.length > 0 || tenantObjectIds.length > 0) {
    // Newest first; first seen per tenant wins (their latest pending request).
    const moveIns = tenantObjectIds.length
      ? await MoveRequest.find({
          tenantId: { $in: tenantObjectIds },
          type: "move-in",
          status: "pending",
          unitId: { $ne: "" },
        })
          .sort({ createdAt: -1 })
          .select("tenantId unitId")
          .lean()
      : [];
    const moveInUnitIds = moveIns
      .map((m) => String(m.unitId))
      .filter((unitId) => OBJECT_ID.test(unitId));

    const units = await Unit.find({
      $or: [{ tenantId: { $in: userIds } }, { _id: { $in: moveInUnitIds } }],
    })
      .select("tenantId name blockName propertyId")
      .lean();

    for (const unit of units) {
      const hint: UnitHint = {
        _id: String(unit._id),
        name: unit.name,
        blockName: unit.blockName,
        propertyId: String(unit.propertyId),
      };
      const occupant = String(unit.tenantId ?? "");
      if (occupant && userIds.includes(occupant)) occupiedByUser.set(occupant, hint);
      nameByUnitId.set(String(unit._id), { name: unit.name, blockName: unit.blockName });
    }
    for (const moveIn of moveIns) {
      const tenantId = String(moveIn.tenantId);
      if (!requestedByTenant.has(tenantId)) requestedByTenant.set(tenantId, String(moveIn.unitId));
    }
  }

  return rows.map((row) => {
    const { userId, ...rest } = row;
    const unit = userId ? (occupiedByUser.get(userId) ?? null) : null;
    const tenantId = String(row._id ?? "");
    const requestedUnitId = tenantId ? requestedByTenant.get(tenantId) : undefined;
    const requested = requestedUnitId ? nameByUnitId.get(requestedUnitId) : undefined;
    const requestedUnit = requestedUnitId
      ? {
          _id: requestedUnitId,
          name: requested?.name ?? "",
          blockName: requested?.blockName ?? "",
        }
      : null;
    return { ...rest, unit, requestedUnit };
  });
}

const tenantInput = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().optional(),
  propertyId: z.string().regex(/^[0-9a-fA-F]{24}$/),
  status: z.enum(["active", "pending", "rejected"]).optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const searchParams = request.nextUrl.searchParams;
  const ownerId = searchParams.get("ownerId");
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");

  await connectToDatabase();

  const authError = await requirePermission(request, "tenant:manage");
  if (authError) return authError;

  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  if (ownerId) {
    if (scope.role === "system-admin") {
      scope.filter.ownerId = ownerId;
    } else if (scope.role === "owner") {
      if (ownerId !== scope.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const filter: Record<string, unknown> = { ...scope.filter };
  if (status) filter.status = status;
  if (propertyId) filter.propertyId = propertyId;

  const [rows, total] = await Promise.all([
    Tenant.find(filter)
      .select(`${TENANT_SAFE_FIELDS} userId`)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Tenant.countDocuments(filter),
  ]);

  const enriched = await attachUnitHints(
    rows as Array<Record<string, unknown> & { userId?: string }>,
  );

  return NextResponse.json(buildPaginationResult(enriched, total, page, limit));
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "tenant:manage");
  if (authError) return authError;

  const body = await request.json();
  const parsed = tenantInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid tenant payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const scope = await getTenantScope(request);
  if (scope instanceof NextResponse) return scope;

  await connectToDatabase();

  const property = await Property.findById(parsed.data.propertyId).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 422 });
  }

  if (scope.role === "owner" && property.ownerId !== scope.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    scope.role === "caretaker" &&
    (!property.caretakerIds?.includes(scope.userId) || property.ownerId !== scope.managedByOwnerId)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = scope.role === "caretaker" ? "pending" : (parsed.data.status ?? "pending");

  const duplicate = await Tenant.findOne({
    propertyId: parsed.data.propertyId,
    email: parsed.data.email,
  })
    .select("_id")
    .lean();
  if (duplicate) {
    return NextResponse.json(
      { error: "A tenant with this email already exists on this property" },
      { status: 409 },
    );
  }

  const existingUser = await User.findOne({
    email: parsed.data.email,
    isActive: true,
    isVerified: true,
  })
    .select("_id")
    .lean();

  const tenant = await Tenant.create({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    propertyId: parsed.data.propertyId,
    ownerId: property.ownerId,
    status,
    joinedAt: status === "active" ? new Date() : undefined,
    notes: parsed.data.notes,
    userId: existingUser ? String(existingUser._id) : "",
  });

  if (!existingUser) {
    // Pre-create an inactive, unverified User so the invite can be a magic-link
    // verify flow (same mechanism as custodian invites). The tenant row keeps
    // userId empty until the invitee verifies and binds on verify-email.
    const randomPassword = crypto.randomBytes(24).toString("base64url").slice(0, 32);
    const passwordHash = await bcrypt.hash(randomPassword, 12);
    const verificationToken = crypto.randomUUID();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await User.create({
      email: parsed.data.email,
      name: parsed.data.name,
      phone: parsed.data.phone ?? "",
      passwordHash,
      role: "tenant",
      isActive: false,
      isVerified: false,
      verificationToken,
      verificationTokenExpiry,
    });

    await sendInviteEmail(parsed.data.email, parsed.data.name, "tenant", verificationToken);
  }

  const created = await Tenant.findById(tenant._id).select(TENANT_SAFE_FIELDS).lean();

  return NextResponse.json({ data: created }, { status: 201 });
}
