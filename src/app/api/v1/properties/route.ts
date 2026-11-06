import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAmenities } from "@/lib/amenities";
import { DEFAULT_PROPERTY_PURPOSE, PROPERTY_PURPOSES } from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, requirePermission } from "@/lib/permissions";
import { computeIdentityHash, findDuplicateCandidates } from "@/lib/property-identity";
import { validatePropertyStaffAssignments } from "@/lib/property-staff";
import { isActivePropertyTypeKey } from "@/lib/property-type-store";
import { blockInput, MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";
import { buildUnitInserts, countRequestedUnits } from "@/lib/units";
import { Block } from "@/models/Block";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

/** Full permission set granted to the admin who creates a property. */
const ADMIN_PROPERTY_CREATOR_PERMISSIONS = [
  "property:read",
  "property:create",
  "property:claim",
  "property:edit",
  "property:delete",
  "unit:read",
  "unit:manage",
  "custodian:manage",
  "tenant:manage",
  "move-request:create",
  "move-request:manage",
  "application:manage",
  "lease:manage",
  "invoice:read",
  "invoice:manage",
  "invoice:mark-paid",
  "invoice:generate",
  "lead:manage",
  "lead:read",
  "notification:read-own",
  "notification:manage",
  "settings:read",
  "settings:write",
  "complaint:read-own",
  "complaint:create",
  "complaint:manage",
  "chat:read-own",
  "chat:send",
  "chat:manage",
  "announcement:read",
  "announcement:manage",
  "document:read-own",
  "document:manage",
  "assignment:read",
  "assignment:grant",
  "assignment:revoke",
  "ownership:read",
  "audit:read",
];

const propertyInput = z.object({
  title: z.string().trim().min(1),
  type: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1),
  price: z.coerce.number().nonnegative(),
  beds: z.coerce.number().int().nonnegative(),
  baths: z.coerce.number().int().nonnegative(),
  area: z.coerce.number().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  status: z.enum(["available", "occupied", "maintenance"]).optional(),
  dateCompleted: z.coerce.date().nullable().optional(),
  purpose: z.enum(PROPERTY_PURPOSES).optional().default(DEFAULT_PROPERTY_PURPOSE),
  caretakerIds: z.array(z.string()).optional(),
  custodianIds: z.array(z.string()).optional(),
  targetOwnerId: z.string().optional(),
  description: z.string().optional(),
  blocks: z.array(blockInput).max(50).optional(),
});

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const searchParams = request.nextUrl.searchParams;
  const ownerId = searchParams.get("ownerId");
  const caretakerId = searchParams.get("caretakerId");
  const status = searchParams.get("status");

  await connectToDatabase();

  const authUser = authenticate(request);

  const publicListing = async () => {
    const available = await Promise.all([
      Property.find({ status: "available", published: true })
        .select("-ownerId -caretakerIds -custodianIds -createdById -__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments({ status: "available", published: true }),
    ]);
    return NextResponse.json(buildPaginationResult(available[0], available[1], page, limit));
  };

  if (!authUser) {
    return publicListing();
  }

  const actorDoc = await User.findById(authUser.userId)
    .select("role isActive managedByOwnerId")
    .lean();
  if (!actorDoc?.isActive) {
    return publicListing();
  }

  if (actorDoc.role === "tenant") {
    return publicListing();
  }

  const filter: Record<string, unknown> = {};
  if (actorDoc.role === "owner") {
    filter.ownerId = authUser.userId;
    if (caretakerId) filter.caretakerIds = caretakerId;
    if (status) filter.status = status;
  } else if (actorDoc.role === "admin") {
    const now = new Date();
    const assignments = await ManagementAssignment.find({
      principalUserId: authUser.userId,
      accessRole: "admin",
      status: "active",
    }).lean();
    const activeReadAssignments = assignments.filter(
      (assignment) =>
        assignment.permissions.includes("property:read") &&
        (!assignment.startsAt || assignment.startsAt <= now) &&
        (!assignment.endsAt || assignment.endsAt > now),
    );
    const propertyIds = [
      ...new Set(activeReadAssignments.map((assignment) => assignment.propertyId)),
    ];
    filter._id = { $in: propertyIds };
    if (ownerId) filter.ownerId = ownerId;
    if (status) filter.status = status;

    const [properties, total] = await Promise.all([
      Property.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Property.countDocuments(filter),
    ]);

    const scopedProperties = properties.map((property) => {
      const propertyAssignments = activeReadAssignments.filter(
        (assignment) => assignment.propertyId === String(property._id),
      );
      if (propertyAssignments.some((assignment) => assignment.scopeType === "property")) {
        return property;
      }

      const blockIds = new Set(
        propertyAssignments
          .filter((assignment) => assignment.scopeType === "block" && assignment.blockId)
          .map((assignment) => assignment.blockId),
      );
      return {
        ...property,
        blocks: blockIds.size
          ? (property.blocks ?? []).filter((block: { _id?: unknown }) =>
              blockIds.has(String(block._id)),
            )
          : [],
        caretakerIds: [],
        custodianIds: [],
      };
    });

    return NextResponse.json(buildPaginationResult(scopedProperties, total, page, limit));
  } else if (actorDoc.role === "custodian") {
    if (!actorDoc.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = actorDoc.managedByOwnerId;
    if (caretakerId) filter.caretakerIds = caretakerId;
    if (status) filter.status = status;
  } else if (actorDoc.role === "caretaker") {
    filter.caretakerIds = authUser.userId;
    filter.ownerId = actorDoc.managedByOwnerId;
    if (status) filter.status = status;
  } else {
    if (ownerId) filter.ownerId = ownerId;
    if (caretakerId) filter.caretakerIds = caretakerId;
    if (status) filter.status = status;
  }

  const [properties, total] = await Promise.all([
    Property.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Property.countDocuments(filter),
  ]);

  return NextResponse.json(buildPaginationResult(properties, total, page, limit));
}

export async function POST(request: NextRequest) {
  const authError = await requirePermission(request, "property:create");
  if (authError) return authError;

  const body = await request.json();
  const parsed = propertyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const propertyType = parsed.data.type?.trim().toLowerCase();
  if (propertyType) {
    if (!(await isActivePropertyTypeKey(propertyType))) {
      return NextResponse.json({ error: "Unknown property type" }, { status: 400 });
    }
    parsed.data.type = propertyType;
  }

  const authUser = authenticate(request);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(authUser.userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  for (const [field, ids] of [
    ["caretakerIds", parsed.data.caretakerIds],
    ["custodianIds", parsed.data.custodianIds],
  ] as const) {
    if (ids && new Set(ids).size !== ids.length) {
      return NextResponse.json(
        { error: `${field} cannot contain duplicate user IDs` },
        { status: 400 },
      );
    }
  }

  const actorId = String(user._id);
  const caretakerIds = parsed.data.caretakerIds ? [...parsed.data.caretakerIds] : [];
  const custodianIds = parsed.data.custodianIds ? [...parsed.data.custodianIds] : [];
  let ownerId = "";

  if (user.role === "owner" || user.role === "admin") {
    ownerId = actorId;
  } else if (user.role === "system-admin") {
    const targetOwnerId = parsed.data.targetOwnerId;
    if (!targetOwnerId) {
      return NextResponse.json(
        { error: "targetOwnerId is required when creating a property as system-admin" },
        { status: 400 },
      );
    }
    const targetOwner = await User.findOne({
      _id: targetOwnerId,
      role: "owner",
      isActive: true,
    })
      .select("_id")
      .lean();
    if (!targetOwner) {
      return NextResponse.json(
        { error: "targetOwnerId must reference an active owner" },
        { status: 400 },
      );
    }
    ownerId = targetOwnerId;
  } else if (user.role === "caretaker") {
    if (caretakerIds.length > 0 || custodianIds.length > 0) {
      return NextResponse.json(
        { error: "Caretakers cannot assign caretakers or custodians to a property" },
        { status: 403 },
      );
    }
    const managingOwnerId = user.managedByOwnerId ?? "";
    if (!managingOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const managingOwner = await User.findOne({
      _id: managingOwnerId,
      role: "owner",
      isActive: true,
    })
      .select("_id")
      .lean();
    if (!managingOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    ownerId = managingOwnerId;
    caretakerIds.push(actorId);
  } else if (user.role === "custodian") {
    const managingOwnerId = user.managedByOwnerId ?? "";
    if (!managingOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const managingOwner = await User.findOne({
      _id: managingOwnerId,
      role: "owner",
      isActive: true,
    })
      .select("_id")
      .lean();
    if (!managingOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    ownerId = managingOwnerId;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uniqueCaretakerIds = [...new Set(caretakerIds)];
  const uniqueCustodianIds = [...new Set(custodianIds)];
  const assignmentError = await validatePropertyStaffAssignments(ownerId, {
    caretakerIds: uniqueCaretakerIds,
    custodianIds: uniqueCustodianIds,
  });
  if (assignmentError) {
    return NextResponse.json({ error: assignmentError }, { status: 400 });
  }

  const inputBlocks = parsed.data.blocks ?? [];
  if (countRequestedUnits(inputBlocks) > MAX_UNITS_PER_PROPERTY) {
    return NextResponse.json(
      { error: `A property may have at most ${MAX_UNITS_PER_PROPERTY} units` },
      { status: 400 },
    );
  }

  const createData = { ...parsed.data };
  delete createData.targetOwnerId;
  delete createData.caretakerIds;
  delete createData.custodianIds;
  delete createData.blocks;
  createData.amenities = normalizeAmenities(parsed.data.amenities ?? []);

  const identityHash = computeIdentityHash(parsed.data.title, parsed.data.location);

  const property = await Property.create({
    ...createData,
    ownerId,
    createdById: actorId,
    caretakerIds: uniqueCaretakerIds,
    custodianIds: uniqueCustodianIds,
    published: false,
    identityHash,
    blocks: inputBlocks.map((block, order) => ({
      name: block.name,
      order,
      rentOverride: block.rentOverride ?? null,
      purpose: block.purpose ?? null,
      floors: block.floors.map((floor) => ({
        level: floor.level,
        label: floor.label ?? "",
        unitsPerFloor: floor.unitsPerFloor ?? 0,
        rentOverride: floor.rentOverride ?? null,
        purpose: floor.purpose ?? null,
      })),
    })),
  });

  const propertyId = String(property._id);

  // Phase 2: dual-write blocks to the standalone Block collection.
  const savedBlocks = (property.blocks ?? []) as Array<{
    _id: unknown;
    name: string;
    order: number;
    rentOverride?: number | null;
    purpose?: string | null;
  }>;
  if (savedBlocks.length > 0) {
    const blockDocs = savedBlocks.map((block) => ({
      propertyId,
      name: block.name,
      order: block.order,
      rentOverride: block.rentOverride ?? null,
      purpose: block.purpose ?? null,
      legacyEmbeddedId: String(block._id),
    }));
    await Block.insertMany(blockDocs, { ordered: false });
  }

  // Phase 2: auto-create a property-scoped ManagementAssignment for admin creators.
  if (user.role === "admin") {
    await ManagementAssignment.create({
      principalUserId: actorId,
      accessRole: "admin",
      scopeType: "property",
      propertyId,
      permissions: ADMIN_PROPERTY_CREATOR_PERMISSIONS,
      status: "active",
      grantedByUserId: actorId,
      grantedAt: new Date(),
      source: "system",
    });
  }

  let unitsCreated = 0;
  if (inputBlocks.length > 0) {
    try {
      const unitDocs = buildUnitInserts(
        propertyId,
        ownerId,
        property.blocks as unknown as Parameters<typeof buildUnitInserts>[2],
        inputBlocks,
      );
      if (unitDocs.length > 0) {
        await Unit.insertMany(unitDocs, { ordered: false });
        unitsCreated = unitDocs.length;
      }
    } catch (error) {
      // Structure generation failed — roll the property back so the client can
      // retry with a valid structure.
      await Property.deleteOne({ _id: property._id });
      const message = error instanceof Error ? error.message : "Failed to generate units";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // Phase 2: check for duplicate candidates (soft signal — not a block).
  const duplicateCandidates = await findDuplicateCandidates(
    parsed.data.title,
    parsed.data.location,
    propertyId,
  );

  return NextResponse.json({ data: property, unitsCreated, duplicateCandidates }, { status: 201 });
}
