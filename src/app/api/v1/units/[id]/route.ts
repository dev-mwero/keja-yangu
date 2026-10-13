import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { unitUpdateInput } from "@/lib/schemas/unit";
import { Unit } from "@/models/Unit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadActor(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return null;
  return auth;
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const auth = await loadActor(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const unit = await Unit.findById(id).lean();
  if (!unit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "unit:read", {
    resource: { ownerId: unit.ownerId },
  });
  if (authError) return authError;

  // Tenants may only read the unit they occupy.
  if (auth.role === "tenant" && unit.tenantId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ data: unit });
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  await connectToDatabase();
  const unit = await Unit.findById(id);
  if (!unit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "unit:manage", {
    resource: { ownerId: unit.ownerId },
  });
  if (authError) return authError;

  const body = await request.json();
  const parsed = unitUpdateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid unit payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  if (updates.name && updates.name !== unit.name) {
    const clash = await Unit.findOne({
      blockId: unit.blockId,
      name: updates.name,
      _id: { $ne: unit._id },
    })
      .select("_id")
      .lean();
    if (clash) {
      return NextResponse.json(
        { error: `Unit "${updates.name}" already exists in this block` },
        { status: 409 },
      );
    }
    unit.name = updates.name;
  }
  if (updates.status !== undefined) unit.status = updates.status;
  if (updates.rent !== undefined) unit.rent = updates.rent;
  if (updates.beds !== undefined) unit.beds = updates.beds;
  if (updates.baths !== undefined) unit.baths = updates.baths;
  if (updates.area !== undefined) unit.area = updates.area;
  if (updates.tenantId !== undefined) {
    unit.tenantId = updates.tenantId;
    if (updates.tenantId && updates.status === undefined) unit.status = "occupied";
    if (!updates.tenantId && updates.status === undefined) unit.status = "available";
  }

  await unit.save();
  return NextResponse.json({ data: unit.toObject() });
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  await connectToDatabase();
  const unit = await Unit.findById(id);
  if (!unit) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "unit:manage", {
    resource: { ownerId: unit.ownerId },
  });
  if (authError) return authError;

  if (unit.status === "occupied" || unit.tenantId) {
    return NextResponse.json(
      { error: "Cannot delete an occupied unit. Move the tenant out first." },
      { status: 409 },
    );
  }

  await Unit.deleteOne({ _id: unit._id });
  return NextResponse.json({ data: { _id: id } });
}
