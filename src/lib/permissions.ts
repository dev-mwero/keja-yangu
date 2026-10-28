import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/jwt";
import { connectToDatabase } from "@/lib/mongoose";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

export type Role = "tenant" | "caretaker" | "custodian" | "owner" | "system-admin";

export const CARETAKER_PRIVILEGES = [
  "create_property",
  "edit_property",
  "delete_assigned_property",
  "manage_units",
  "manage_tenants",
  "process_move_requests",
  "manage_invoices",
  "manage_complaints",
  "manage_announcements",
  "send_messages",
  "manage_documents",
] as const;

export type CaretakerPrivilege = (typeof CARETAKER_PRIVILEGES)[number];

export type Action =
  | "property:create"
  | "property:edit"
  | "property:delete"
  | "property-type:manage"
  | "recycle-bin:manage"
  | "unit:read"
  | "unit:manage"
  | "custodian:manage"
  | "tenant:manage"
  | "move-request:create"
  | "move-request:manage"
  | "application:manage"
  | "lease:manage"
  | "invoice:read"
  | "invoice:manage"
  | "invoice:mark-paid"
  | "invoice:generate"
  | "invoice:read-own"
  | "lead:manage"
  | "lead:read"
  | "notification:read-own"
  | "notification:manage"
  | "settings:read"
  | "settings:write"
  | "complaint:read-own"
  | "complaint:create"
  | "complaint:manage"
  | "chat:read-own"
  | "chat:send"
  | "chat:manage"
  | "announcement:read"
  | "announcement:manage"
  | "document:read-own"
  | "document:manage";

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

/**
 * A role that manages a single owner's portfolio (owner, or an owner-delegate
 * custodian). Used to scope resource checks by `ownerId`.
 */
export function isOwnerScopedRole(role: Role): boolean {
  return role === "owner" || role === "custodian";
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
  const managedByOwnerId = user.managedByOwnerId ?? "";

  // The property taxonomy is platform-wide: only the system administrator may
  // change it, even though owners otherwise have full control of a portfolio.
  // The recycle bin (restore/purge soft-deleted records) is likewise limited to
  // the system administrator.
  if (
    (action === "property-type:manage" || action === "recycle-bin:manage") &&
    role !== "system-admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (role === "tenant") {
    const tenantActions: Action[] = [
      "invoice:read-own",
      "notification:read-own",
      "notification:manage",
      "settings:read",
      "settings:write",
      "complaint:read-own",
      "complaint:create",
      "chat:read-own",
      "chat:send",
      "announcement:read",
      "document:read-own",
      "unit:read",
      "move-request:create",
    ];
    return tenantActions.includes(action)
      ? null
      : NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (isFullControlRole(role) || role === "custodian") {
    const resource = opts?.resource;
    // A custodian must be bound to an owner.
    if (role === "custodian" && !managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Custodians are owner-delegates: only owners and system-admins may manage
    // custodians (a custodian cannot invite or revoke other custodians).
    if (action === "custodian:manage" && role === "custodian") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const scopeOwnerId =
      role === "system-admin" ? null : role === "owner" ? String(user._id) : managedByOwnerId;
    const ownsResource =
      !!resource &&
      (action === "property:edit" ||
        action === "property:delete" ||
        action === "unit:read" ||
        action === "unit:manage" ||
        action === "tenant:manage" ||
        action === "move-request:manage" ||
        action === "application:manage" ||
        action === "lease:manage" ||
        action === "invoice:manage" ||
        action === "invoice:mark-paid" ||
        action === "complaint:manage" ||
        action === "chat:manage" ||
        action === "announcement:manage" ||
        action === "document:manage" ||
        action === "lead:manage" ||
        action === "lead:read");
    if (scopeOwnerId && ownsResource && resource.ownerId !== scopeOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }

  if (role !== "caretaker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = String(user._id);
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
    case "unit:read":
      return null;
    case "unit:manage":
      if (
        !privileges.includes("manage_units") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "move-request:create":
      return null;
    case "move-request:manage":
      if (
        !privileges.includes("process_move_requests") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "application:manage":
      if (
        !privileges.includes("manage_tenants") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "custodian:manage":
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    case "notification:read-own":
    case "notification:manage":
    case "settings:read":
    case "settings:write":
    case "complaint:read-own":
    case "complaint:create":
    case "chat:read-own":
    case "chat:send":
    case "announcement:read":
    case "document:read-own":
      return null;
    case "complaint:manage":
      if (
        !privileges.includes("manage_complaints") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "chat:manage":
      if (
        !privileges.includes("send_messages") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "announcement:manage":
      if (
        !privileges.includes("manage_announcements") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "document:manage":
      if (
        !privileges.includes("manage_documents") ||
        !resource ||
        resource.ownerId !== managedByOwnerId
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "lead:read":
    case "lead:manage":
      if (!privileges.includes("manage_tenants")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
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
  if (user.role === "custodian") {
    if (!managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return { filter: { ownerId: managedByOwnerId }, userId, role: user.role, managedByOwnerId };
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
  if (scope.role === "custodian") {
    return tenant.ownerId === scope.managedByOwnerId;
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
