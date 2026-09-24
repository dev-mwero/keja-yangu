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
