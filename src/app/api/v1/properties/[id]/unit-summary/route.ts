import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Compact unit availability summary for a public property view.
 *
 * Groups live (non-soft-deleted) units by block and floor so a property page
 * can show availability without rendering every unit.
 *
 * Public for published, available properties.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  }

  await connectToDatabase();

  const authUser = authenticate(request);
  const isManager =
    authUser && ["owner", "caretaker", "custodian", "system-admin"].includes(authUser.role);
  const property = isManager
    ? await Property.findOne({ _id: id, deletedAt: null })
        .select("_id blocks ownerId caretakerIds")
        .lean()
    : await Property.findOne({
        _id: id,
        status: "available",
        published: true,
        deletedAt: null,
      })
        .select("_id blocks")
        .lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  if (isManager) {
    const permissionError = await requirePermission(request, "unit:read", { resource: property });
    if (permissionError) return permissionError;
  }

  const units = await Unit.find({
    propertyId: id,
    deletedAt: null,
  })
    .select("status floorLabel floorLevel blockName")
    .lean();

  const statuses = ["available", "occupied", "maintenance"] as const;
  type Status = (typeof statuses)[number];
  type Counts = { total: number } & Record<Status, number>;
  const emptyCounts = (): Counts => ({
    total: 0,
    available: 0,
    occupied: 0,
    maintenance: 0,
  });
  const propertyBlocks: Array<{ name: string; order?: number }> = property.blocks ?? [];
  const blockOrder = new Map<string, number>(
    propertyBlocks.map((block, index) => [block.name, block.order ?? index]),
  );
  const floorGroups = new Map<
    string,
    Counts & { label: string; level: number; block: string | null }
  >();
  const blockGroups = new Map<string, Counts>();

  for (const unit of units) {
    const level = typeof unit.floorLevel === "number" ? unit.floorLevel : 0;
    const label =
      unit.floorLabel?.trim() || (level === 0 ? "Ground" : String(level)) || "Unspecified";
    const block = unit.blockName?.trim() || null;
    const key = `${block ?? ""}:${level}:${label}`;
    const floor = floorGroups.get(key) ?? {
      ...emptyCounts(),
      label,
      level,
      block,
    };
    floor.total += 1;
    if (statuses.includes(unit.status as Status)) floor[unit.status as Status] += 1;
    floorGroups.set(key, floor);

    if (block) {
      const blockSummary = blockGroups.get(block) ?? emptyCounts();
      blockSummary.total += 1;
      if (statuses.includes(unit.status as Status)) blockSummary[unit.status as Status] += 1;
      blockGroups.set(block, blockSummary);
    }
  }

  const floors = Array.from(floorGroups.values()).sort(
    (a, b) =>
      (a.block ? (blockOrder.get(a.block) ?? Number.MAX_SAFE_INTEGER) : -1) -
        (b.block ? (blockOrder.get(b.block) ?? Number.MAX_SAFE_INTEGER) : -1) ||
      a.level - b.level ||
      a.label.localeCompare(b.label),
  );
  const blocks = Array.from(blockGroups, ([name, counts]) => ({ name, ...counts })).sort(
    (a, b) =>
      (blockOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER) -
        (blockOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name),
  );

  return NextResponse.json({
    data: {
      propertyId: id,
      totalUnits: units.length,
      byStatus: units.reduce(
        (counts, unit) => {
          if (statuses.includes(unit.status as Status)) counts[unit.status as Status] += 1;
          return counts;
        },
        { available: 0, occupied: 0, maintenance: 0 },
      ),
      floors,
      blocks,
    },
  });
}
