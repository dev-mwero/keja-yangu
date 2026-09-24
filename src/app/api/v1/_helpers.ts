import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, type Role } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export interface InvoiceActor {
  role: Role;
  userId: string;
  managedByOwnerId: string;
  assignedPropertyIds: string[];
}

export async function resolveInvoiceActor(
  request: NextRequest,
): Promise<InvoiceActor | NextResponse> {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = String(user._id);
  const managedByOwnerId = user.managedByOwnerId ?? "";
  let assignedPropertyIds: string[] = [];
  if (user.role === "caretaker" && managedByOwnerId) {
    const properties = await Property.find({ caretakerIds: userId, ownerId: managedByOwnerId })
      .select("_id")
      .lean();
    assignedPropertyIds = properties.map((p) => String(p._id));
  }

  return { role: user.role, userId, managedByOwnerId, assignedPropertyIds };
}

export async function resolveTenantActor(request: NextRequest): Promise<string | NextResponse> {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role").lean();
  if (user?.role !== "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return auth.userId;
}

export interface DashboardActor {
  role: Role;
  userId: string;
  managedByOwnerId: string;
  assignedPropertyIds: string[];
  tenantIds: string[];
  tenantPropertyIds: string[];
  tenantOwnerIds: string[];
}

/**
 * Resolves the authenticated user plus the scoping ids the communications
 * routes need. Tenants get their bound Tenant row ids, property ids and owner
 * ids; caretakers get their assigned property ids (properties of the managing
 * owner that list them in `caretakerIds`). Owners and system-admins get none.
 */
export async function resolveDashboardActor(
  request: NextRequest,
): Promise<DashboardActor | NextResponse> {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = String(user._id);
  const managedByOwnerId = user.managedByOwnerId ?? "";
  let assignedPropertyIds: string[] = [];
  let tenantIds: string[] = [];
  let tenantPropertyIds: string[] = [];
  let tenantOwnerIds: string[] = [];

  if (user.role === "caretaker" && managedByOwnerId) {
    const properties = await Property.find({ caretakerIds: userId, ownerId: managedByOwnerId })
      .select("_id")
      .lean();
    assignedPropertyIds = properties.map((p) => String(p._id));
  }

  // One Tenant query supplies the bound row ids, property ids and owner ids
  // (the split `resolveTenantIds` query is folded in for a single round-trip).
  if (user.role === "tenant") {
    const rows = await Tenant.find({ userId }).select("_id propertyId ownerId").lean();
    tenantIds = rows.map((t) => String(t._id));
    tenantPropertyIds = rows.map((t) => t.propertyId).filter(Boolean);
    tenantOwnerIds = rows.map((t) => t.ownerId).filter(Boolean);
  }

  return {
    role: user.role,
    userId,
    managedByOwnerId,
    assignedPropertyIds,
    tenantIds,
    tenantPropertyIds,
    tenantOwnerIds,
  };
}

/**
 * Resolves property ids to their titles with a single `$in` query. Missing ids
 * are simply absent from the returned map.
 */
export async function propertyTitleMap(propertyIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(propertyIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  await connectToDatabase();
  const properties = await Property.find({ _id: { $in: uniqueIds } })
    .select("_id title")
    .lean();
  return new Map(properties.map((p) => [String(p._id), p.title]));
}

export async function resolveTenantIds(userId: string): Promise<string[]> {
  await connectToDatabase();
  const tenantRows = await Tenant.find({ userId }).select("_id").lean();
  return tenantRows.map((t) => String(t._id));
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return {};
  }
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}
