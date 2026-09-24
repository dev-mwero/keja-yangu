import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, isFullControlRole, requirePermission } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

const propertyUpdate = z.object({
  title: z.string().trim().min(1).optional(),
  type: z.enum(["room", "apartment", "building"]).optional(),
  location: z.string().trim().min(1).optional(),
  price: z.coerce.number().nonnegative().optional(),
  beds: z.coerce.number().int().nonnegative().optional(),
  baths: z.coerce.number().int().nonnegative().optional(),
  area: z.coerce.number().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  status: z.enum(["available", "occupied", "maintenance"]).optional(),
  caretakerIds: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();
  const authUser = authenticate(request);
  let actor: { _id: string; role: string; managedByOwnerId?: string } | null = null;
  if (authUser) {
    const doc = await User.findById(authUser.userId)
      .select("_id role isActive managedByOwnerId")
      .lean();
    actor = doc?.isActive
      ? { _id: String(doc._id), role: doc.role, managedByOwnerId: doc.managedByOwnerId }
      : null;
  }

  const PUBLIC_PROJECTION = "-ownerId -caretakerIds -createdById -__v";

  let property: { status?: string; _id?: unknown } | null = null;
  if (!actor) {
    property = await Property.findOne({ _id: id, status: "available" })
      .select(PUBLIC_PROJECTION)
      .lean();
  } else if (actor.role === "system-admin") {
    property = await Property.findById(id).lean();
  } else if (actor.role === "owner") {
    property = await Property.findOne({ _id: id, ownerId: actor._id }).lean();
  } else if (actor.role === "caretaker") {
    const scope =
      typeof actor.managedByOwnerId === "string" && actor.managedByOwnerId.length > 0
        ? { ownerId: actor.managedByOwnerId }
        : {};
    property = await Property.findOne({ _id: id, caretakerIds: actor._id, ...scope }).lean();
  } else {
    property = await Property.findOne({ _id: id, status: "available" })
      .select(PUBLIC_PROJECTION)
      .lean();
  }

  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  return NextResponse.json({ data: property });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();
  const property = await Property.findById(id).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "property:edit", { resource: property });
  if (authError) return authError;

  const body = await request.json();
  const parsed = propertyUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const actor = authenticate(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actorDoc = await User.findById(actor.userId).select("role").lean();
  const canManageCaretakerIds = actorDoc ? isFullControlRole(actorDoc.role) : false;

  const updateData = { ...parsed.data };
  if (!canManageCaretakerIds) {
    delete updateData.caretakerIds;
  }

  const updated = await Property.findOneAndUpdate({ _id: id }, updateData, {
    new: true,
    runValidators: true,
  }).lean();
  if (!updated) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  return NextResponse.json({ data: updated });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();
  const property = await Property.findById(id).lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "property:delete", { resource: property });
  if (authError) return authError;

  const referencingTenant = await Tenant.exists({ propertyId: id });
  if (referencingTenant) {
    return NextResponse.json(
      { error: "Property is in use by tenants and cannot be deleted" },
      { status: 409 },
    );
  }

  const deleted = await Property.findOneAndDelete({ _id: id }).lean();
  if (!deleted) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  return NextResponse.json({ data: deleted });
}
