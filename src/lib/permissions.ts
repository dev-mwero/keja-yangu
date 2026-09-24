import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/jwt";
import { connectToDatabase } from "@/lib/mongoose";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

export type Role = "tenant" | "caretaker" | "owner" | "system-admin";

export const CARETAKER_PRIVILEGES = [
  "create_property",
  "edit_property",
  "delete_assigned_property",
  "manage_tenants",
  "manage_invoices",
] as const;

export type CaretakerPrivilege = (typeof CARETAKER_PRIVILEGES)[number];

export type Action =
  | "property:create"
  | "property:edit"
  | "property:delete"
  | "tenant:manage"
  | "lease:manage"
  | "invoice:read"
  | "invoice:manage"
  | "invoice:mark-paid"
  | "invoice:generate"
  | "invoice:read-own";

export interface AuthUser {
  userId: string;
  role: Role;
  name?: string;
  email?: string;
}

export interface UserCtx {
  role: Role;
  isActive: boolean;
  privileges: CaretakerPrivilege[];
  managedByOwnerId: string;
}

export function authenticate(request: Request): AuthUser | null {
  const cookieHeader = request.headers.get("cookie");
  const token = cookieHeader
    ?.split("; ")
    .find((c) => c.startsWith("keja-token="))
    ?.split("=")[1];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      role: Role;
      name?: string;
      email?: string;
    };
    return { userId: payload.userId, role: payload.role, name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

export function isFullControlRole(role: Role): boolean {
  return role === "owner" || role === "system-admin";
}

export async function requireAuth(
  request: NextRequest,
  roles?: Role[],
): Promise<NextResponse | null> {
  const user = authenticate(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (roles && !roles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requirePermission(
  request: NextRequest,
  action: Action,
  opts?: { resource?: { ownerId?: string; caretakerIds?: string[] } },
): Promise<NextResponse | null> {
  const token = request.cookies.get("keja-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId: string;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    userId = payload.userId;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = user.role;

  if (role === "tenant") {
    return action === "invoice:read-own"
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isFullControlRole(role)) {
    const resource = opts?.resource;
    const ownsResource =
      !!resource &&
      (action === "property:edit" ||
        action === "property:delete" ||
        action === "lease:manage" ||
        action === "invoice:manage" ||
        action === "invoice:mark-paid");
    if (role === "owner" && ownsResource && resource.ownerId !== String(user._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }

  if (role !== "caretaker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = String(user._id);
  const managedByOwnerId = user.managedByOwnerId ?? "";
  const privileges = (user.privileges ?? []) as CaretakerPrivilege[];
  const resource = opts?.resource;

  if (!managedByOwnerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  switch (action) {
    case "property:create":
      if (!privileges.includes("create_property")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "property:edit":
      if (
        !privileges.includes("edit_property") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "property:delete":
      if (
        !privileges.includes("delete_assigned_property") ||
        !resource ||
        resource.ownerId !== managedByOwnerId ||
        !resource.caretakerIds?.includes(actorId)
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "tenant:manage":
      if (!privileges.includes("manage_tenants")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "lease:manage":
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    case "invoice:read":
      if (!privileges.includes("manage_invoices")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "invoice:manage":
    case "invoice:mark-paid":
      if (
        !privileges.includes("manage_invoices") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "invoice:generate":
      if (!privileges.includes("manage_invoices")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "invoice:read-own":
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function getCaretakerContext(userId: string): Promise<UserCtx> {
  await connectToDatabase();
  const user = await User.findById(userId).select("-passwordHash").lean();
  if (!user) {
    return { role: "caretaker", isActive: false, privileges: [], managedByOwnerId: "" };
  }
  return {
    role: user.role,
    isActive: user.isActive,
    privileges: (user.privileges ?? []) as CaretakerPrivilege[],
    managedByOwnerId: user.managedByOwnerId ?? "",
  };
}

export interface TenantScope {
  filter: Record<string, unknown>;
  userId: string;
  role: Role;
  managedByOwnerId: string;
  assignedPropertyIds?: string[];
}

export async function getTenantScope(request: NextRequest): Promise<NextResponse | TenantScope> {
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

  if (user.role === "owner") {
    return { filter: { ownerId: userId }, userId, role: user.role, managedByOwnerId };
  }
  if (user.role === "system-admin") {
    return { filter: {}, userId, role: user.role, managedByOwnerId };
  }
  if (user.role === "caretaker") {
    if (!managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const properties = await Property.find({ caretakerIds: userId }).select("_id").lean();
    const assignedPropertyIds = properties.map((p) => String(p._id));
    return {
      filter: { propertyId: { $in: assignedPropertyIds }, ownerId: managedByOwnerId },
      userId,
      role: user.role,
      managedByOwnerId,
      assignedPropertyIds,
    };
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function tenantMatchesScope(
  tenant: { ownerId: string; propertyId: string },
  scope: TenantScope,
): boolean {
  if (scope.role === "owner") {
    return tenant.ownerId === scope.userId;
  }
  if (scope.role === "system-admin") {
    return true;
  }
  if (scope.role !== "caretaker") {
    return false;
  }
  return (
    tenant.ownerId === scope.managedByOwnerId &&
    (scope.assignedPropertyIds?.includes(tenant.propertyId) ?? false)
  );
}
