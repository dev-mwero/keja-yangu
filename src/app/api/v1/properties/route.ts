import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate, requirePermission } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

const propertyInput = z.object({
  title: z.string().trim().min(1),
  type: z.enum(["room", "apartment", "building"]).optional(),
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

  if (!authenticate(request)) {
    const available = await Promise.all([
      Property.find({ status: "available" })
        .select("-ownerId -caretakerIds -createdById -__v")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Property.countDocuments({ status: "available" }),
    ]);
    return NextResponse.json(buildPaginationResult(available[0], available[1], page, limit));
  }

  const filter: Record<string, unknown> = {};
  if (ownerId) filter.ownerId = ownerId;
  if (caretakerId) filter.caretakerIds = caretakerId;
  if (status) filter.status = status;

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

  const createData = { ...parsed.data };
  delete createData.targetOwnerId;
  delete createData.caretakerIds;

  const property = await Property.create({
    ...createData,
    ownerId,
    createdById: actorId,
    caretakerIds: uniqueCaretakerIds,
  });
  return NextResponse.json({ data: property }, { status: 201 });
}
