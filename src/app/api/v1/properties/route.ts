import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normalizeAmenities } from "@/lib/amenities";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, requirePermission } from "@/lib/permissions";
import { isActivePropertyTypeKey } from "@/lib/property-type-store";
import { blockInput, MAX_UNITS_PER_PROPERTY } from "@/lib/schemas/structure";
import { buildUnitInserts, countRequestedUnits } from "@/lib/units";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

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
  caretakerIds: z.array(z.string()).optional(),
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
        .select("-ownerId -caretakerIds -createdById -__v")
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
  } else if (actorDoc.role === "custodian") {
    if (!actorDoc.managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.ownerId = actorDoc.managedByOwnerId;
    if (caretakerId) filter.caretakerIds = caretakerId;
    if (status) filter.status = status;
  } else if (actorDoc.role === "caretaker") {
    filter.caretakerIds = authUser.userId;
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

  const actorId = String(user._id);
  const caretakerIds = parsed.data.caretakerIds ? [...parsed.data.caretakerIds] : [];
  let ownerId = "";

  if (user.role === "owner") {
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
  if (uniqueCaretakerIds.length > 0) {
    const caretakers = await User.find({ _id: { $in: uniqueCaretakerIds }, role: "caretaker" })
      .select("_id")
      .lean();
    if (caretakers.length !== uniqueCaretakerIds.length) {
      return NextResponse.json(
        { error: "caretakerIds must reference caretaker users" },
        { status: 400 },
      );
    }
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
  delete createData.blocks;
  createData.amenities = normalizeAmenities(parsed.data.amenities ?? []);

  const property = await Property.create({
    ...createData,
    ownerId,
    createdById: actorId,
    caretakerIds: uniqueCaretakerIds,
    published: false,
    blocks: inputBlocks.map((block, order) => ({
      name: block.name,
      order,
      rentOverride: block.rentOverride ?? null,
      floors: block.floors.map((floor) => ({
        level: floor.level,
        label: floor.label ?? "",
        unitsPerFloor: floor.unitsPerFloor ?? 0,
        rentOverride: floor.rentOverride ?? null,
      })),
    })),
  });

  let unitsCreated = 0;
  if (inputBlocks.length > 0) {
    try {
      const unitDocs = buildUnitInserts(
        String(property._id),
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

  return NextResponse.json({ data: property, unitsCreated }, { status: 201 });
}
