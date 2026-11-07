import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceScopedAuthorization } from "@/lib/authorization-enforcement";
import { compareAuthorizationShadow, shadowSampleRate } from "@/lib/authorization-shadow";
import { getJwtSecret } from "@/lib/jwt";
import { connectToDatabase } from "@/lib/mongoose";
import { Lease } from "@/models/Lease";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

export type Role =
  | "tenant"
  | "caretaker"
  | "custodian"
  | "owner"
  | "admin"
  | "broker"
  | "system-admin";

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

export const CUSTODIAN_PRIVILEGES = ["assign_privileges"] as const;

export type CustodianPrivilege = (typeof CUSTODIAN_PRIVILEGES)[number];

export type Privilege = CaretakerPrivilege | CustodianPrivilege;

/** A custodian trusted to manage caretaker privileges for their owner. */
export function isPrivilegedCustodian(user: {
  role: Role;
  privileges?: string[] | null;
  isActive?: boolean;
  managedByOwnerId?: string | null;
}): boolean {
  return (
    user.role === "custodian" &&
    user.isActive === true &&
    Boolean(user.managedByOwnerId) &&
    (user.privileges ?? []).includes("assign_privileges")
  );
}

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
  tokenVersion?: number;
}

export interface UserCtx {
  role: Role;
  isActive: boolean;
  privileges: Privilege[];
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
      tokenVersion?: number;
    };
    return {
      userId: payload.userId,
      role: payload.role,
      name: payload.name,
      email: payload.email,
      tokenVersion: payload.tokenVersion,
    };
  } catch {
    return null;
  }
}

export function isFullControlRole(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "system-admin";
}

/**
 * A role that manages a single owner's portfolio (owner, or an owner-delegate
 * custodian). Used to scope resource checks by `ownerId`.
 */
export function isOwnerScopedRole(role: Role): boolean {
  return role === "owner" || role === "admin" || role === "custodian";
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

export interface PermissionResource {
  _id?: unknown;
  ownerId?: string;
  caretakerIds?: string[];
  propertyId?: string;
  blockId?: string;
  unitId?: string;
  lifecycleState?: "draft" | "active" | "archived" | "merged";
}

async function caretakerAssignedToProperty(
  actorId: string,
  managedByOwnerId: string,
  resource: PermissionResource | undefined,
): Promise<boolean> {
  if (!resource) return false;
  if (resource.caretakerIds) return resource.caretakerIds.includes(actorId);
  if (!resource.propertyId) return false;
  const property = await Property.findOne({
    _id: resource.propertyId,
    ownerId: managedByOwnerId,
    caretakerIds: actorId,
  })
    .select("_id")
    .lean();
  return property !== null;
}

async function requirePermissionLegacy(
  request: NextRequest,
  action: Action,
  opts?: { resource?: PermissionResource },
): Promise<NextResponse | null> {
  const token = request.cookies.get("keja-token")?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId: string;
  let tokenVersion: number;
  try {
    const payload = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      tokenVersion?: number;
    };
    userId = payload.userId;
    tokenVersion = payload.tokenVersion ?? 0;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((user.tokenVersion ?? 0) !== tokenVersion) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
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
      role === "system-admin"
        ? null
        : role === "owner" || role === "admin"
          ? String(user._id)
          : managedByOwnerId;
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
        resource.ownerId !== managedByOwnerId ||
        (Array.isArray(resource.caretakerIds) &&
          resource.caretakerIds.length > 0 &&
          !resource.caretakerIds.includes(actorId))
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
      if (
        !resource ||
        resource.ownerId !== managedByOwnerId ||
        !(await caretakerAssignedToProperty(actorId, managedByOwnerId, resource))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "unit:manage":
      if (
        !privileges.includes("manage_units") ||
        !resource ||
        resource.ownerId !== managedByOwnerId ||
        !(await caretakerAssignedToProperty(actorId, managedByOwnerId, resource))
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
        resource.ownerId !== managedByOwnerId ||
        !(await caretakerAssignedToProperty(actorId, managedByOwnerId, resource))
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return null;
    case "application:manage":
      if (
        !privileges.includes("manage_tenants") ||
        !resource ||
        resource.ownerId !== managedByOwnerId ||
        !(await caretakerAssignedToProperty(actorId, managedByOwnerId, resource))
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

/**
 * Permission entry point. Route families listed in
 * `AUTHZ_ENFORCE_ROUTE_FAMILIES` are decided by the scoped policy; all others
 * keep the legacy response while optionally running shadow comparison.
 */
export async function requirePermission(
  request: NextRequest,
  action: Action,
  opts?: { resource?: PermissionResource },
): Promise<NextResponse | null> {
  const result = await requirePermissionLegacy(request, action, opts);
  // A failed authentication (including a stale `tokenVersion`) is never
  // overridable by scoped-policy enforcement.
  if (result && result.status === 401) return result;
  const auth = authenticate(request);
  if (!auth) return result;

  try {
    const enforced = await enforceScopedAuthorization({
      request,
      actorUserId: auth.userId,
      action,
      resource: opts?.resource,
      legacyAllowed: result === null,
      force: auth.role === "admin",
    });
    if (enforced) {
      if (enforced.allowed) return null;
      return result ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (error) {
    console.error("Authorization enforcement failed", error);
    return NextResponse.json({ error: "Authorization unavailable" }, { status: 500 });
  }

  if (shadowSampleRate() <= 0) return result;

  const policyResource = opts?.resource?.propertyId
    ? {
        propertyId: opts.resource.propertyId,
        blockId: opts.resource.blockId,
        unitId: opts.resource.unitId,
      }
    : undefined;
  if (opts?.resource && !policyResource) return result;

  try {
    await compareAuthorizationShadow({
      actorUserId: auth.userId,
      action,
      resource: policyResource,
      legacyAllowed: result === null,
      request: {
        ip: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      },
    });
  } catch (error) {
    console.error("Authorization shadow comparison failed", error);
  }

  return result;
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
    privileges: (user.privileges ?? []) as Privilege[],
    managedByOwnerId: user.managedByOwnerId ?? "",
  };
}

export interface TenantScope {
  filter: Record<string, unknown>;
  leaseFilter?: Record<string, unknown>;
  userId: string;
  role: Role;
  managedByOwnerId: string;
  assignedPropertyIds?: string[];
  propertyScopeIds?: string[];
  assignedUnitIds?: string[];
  assignedTenantIds?: string[];
  /** Custodian/caretaker scope resolved from ManagementAssignment (not legacy fields). */
  staffAssignmentBacked?: boolean;
}

export interface AdminAssignmentScope {
  assignedPropertyIds: string[];
  propertyScopeIds: string[];
  assignedBlockIds: string[];
  assignedUnitIds: string[];
  assignedTenantIds: string[];
}

export interface StaffAssignmentScope extends AdminAssignmentScope {
  /** True when the principal holds at least one active assignment (in window, with the action). */
  hasAssignments: boolean;
}

type StaffAccessRole = "admin" | "custodian" | "caretaker";

async function getAssignmentScope(
  userId: string,
  accessRole: StaffAccessRole,
  action: Action,
): Promise<StaffAssignmentScope> {
  const now = new Date();
  const assignments = await ManagementAssignment.find({
    principalUserId: userId,
    accessRole,
    status: "active",
  }).lean();
  const activeAssignments = assignments.filter(
    (assignment) =>
      (assignment.permissions ?? []).includes(action) &&
      (!assignment.startsAt || assignment.startsAt <= now) &&
      (!assignment.endsAt || assignment.endsAt > now),
  );
  const assignedPropertyIds = [
    ...new Set(activeAssignments.map((assignment) => assignment.propertyId)),
  ];
  const propertyScopeIds = [
    ...new Set(
      activeAssignments
        .filter((assignment) => assignment.scopeType === "property")
        .map((assignment) => assignment.propertyId),
    ),
  ];
  const assignedBlockIds = [
    ...new Set(
      activeAssignments
        .filter((assignment) => assignment.scopeType === "block" && assignment.blockId)
        .map((assignment) => assignment.blockId),
    ),
  ];
  const unitScopeQueries: Record<string, unknown>[] = [];
  for (const assignment of activeAssignments) {
    if (assignment.scopeType === "block" && assignment.blockId) {
      unitScopeQueries.push({ propertyId: assignment.propertyId, blockId: assignment.blockId });
    } else if (assignment.scopeType === "unit" && assignment.unitId) {
      unitScopeQueries.push({ _id: assignment.unitId, propertyId: assignment.propertyId });
    }
  }
  const scopedUnits = unitScopeQueries.length
    ? await Unit.find({ $or: unitScopeQueries }).select("_id").lean()
    : [];
  const assignedUnitIds = [...new Set(scopedUnits.map((unit) => String(unit._id)))];
  const leases = assignedUnitIds.length
    ? await Lease.find({ unitId: { $in: assignedUnitIds }, status: "active" })
        .select("tenantId")
        .lean()
    : [];
  const assignedTenantIds = [...new Set(leases.map((lease) => String(lease.tenantId)))];

  return {
    assignedPropertyIds,
    propertyScopeIds,
    assignedBlockIds,
    assignedUnitIds,
    assignedTenantIds,
    hasAssignments: activeAssignments.length > 0,
  };
}

export async function getAdminAssignmentScope(
  userId: string,
  action: Action,
): Promise<AdminAssignmentScope> {
  const { hasAssignments, ...scope } = await getAssignmentScope(userId, "admin", action);
  void hasAssignments;
  return scope;
}

/**
 * Assignment-backed scope for custodian/caretaker staff. Consumers prefer this
 * over the legacy `managedByOwnerId` / `Property.caretakerIds` fields whenever
 * `hasAssignments` is true; staff without assignments keep the legacy fallback
 * until backfilled.
 */
export async function getStaffAssignmentScope(
  userId: string,
  accessRole: "custodian" | "caretaker",
  action: Action,
): Promise<StaffAssignmentScope> {
  return getAssignmentScope(userId, accessRole, action);
}

type TenantScopeAction = "tenant:manage" | "lease:manage" | "unit:manage";

/**
 * Tenant list filter from an assignment-backed staff scope: property-scoped
 * assignments match by property, unit-level coverage matches via the tenants
 * already assigned to those units. Mirrors the admin branch's $or clauses.
 */
function staffTenantFilter(scope: StaffAssignmentScope): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  if (scope.propertyScopeIds.length > 0) {
    clauses.push({ propertyId: { $in: scope.propertyScopeIds } });
  }
  if (scope.assignedTenantIds.length > 0) {
    clauses.push({ _id: { $in: scope.assignedTenantIds } });
  }
  if (clauses.length === 0) return { _id: { $in: [] } };
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

/**
 * Lease list filter from an assignment-backed staff scope (mirror of the
 * admin lease clauses): property-scoped assignments match by property,
 * unit-scoped assignments match by unit.
 */
function staffLeaseFilter(scope: StaffAssignmentScope): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  if (scope.propertyScopeIds.length > 0) {
    clauses.push({ propertyId: { $in: scope.propertyScopeIds } });
  }
  if (scope.assignedUnitIds.length > 0) {
    clauses.push({ unitId: { $in: scope.assignedUnitIds } });
  }
  if (clauses.length === 0) return { _id: { $in: [] } };
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

export async function getTenantScope(
  request: NextRequest,
  action: TenantScopeAction = "tenant:manage",
): Promise<NextResponse | TenantScope> {
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
    const filter = { ownerId: userId };
    return { filter, leaseFilter: filter, userId, role: user.role, managedByOwnerId };
  }
  if (user.role === "admin") {
    const assignmentScope = await getAdminAssignmentScope(userId, action);

    const tenantClauses: Record<string, unknown>[] = [];
    const leaseClauses: Record<string, unknown>[] = [];
    if (assignmentScope.propertyScopeIds.length > 0) {
      tenantClauses.push({ propertyId: { $in: assignmentScope.propertyScopeIds } });
      leaseClauses.push({ propertyId: { $in: assignmentScope.propertyScopeIds } });
    }
    if (assignmentScope.assignedTenantIds.length > 0) {
      tenantClauses.push({ _id: { $in: assignmentScope.assignedTenantIds } });
    }
    if (assignmentScope.assignedUnitIds.length > 0) {
      leaseClauses.push({ unitId: { $in: assignmentScope.assignedUnitIds } });
    }
    const tenantFilter = tenantClauses.length
      ? tenantClauses.length === 1
        ? tenantClauses[0]
        : { $or: tenantClauses }
      : { _id: { $in: [] } };
    const leaseFilter = leaseClauses.length
      ? leaseClauses.length === 1
        ? leaseClauses[0]
        : { $or: leaseClauses }
      : { _id: { $in: [] } };

    return {
      filter: action === "lease:manage" ? leaseFilter : tenantFilter,
      leaseFilter,
      userId,
      role: user.role,
      managedByOwnerId,
      ...assignmentScope,
    };
  }
  if (user.role === "custodian") {
    const staffScope = await getStaffAssignmentScope(userId, "custodian", action);
    if (staffScope.hasAssignments) {
      return {
        filter: staffTenantFilter(staffScope),
        leaseFilter: staffLeaseFilter(staffScope),
        userId,
        role: user.role,
        managedByOwnerId,
        ...staffScope,
        staffAssignmentBacked: true,
      };
    }
    if (!managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const filter = { ownerId: managedByOwnerId };
    return { filter, leaseFilter: filter, userId, role: user.role, managedByOwnerId };
  }
  if (user.role === "system-admin") {
    return { filter: {}, leaseFilter: {}, userId, role: user.role, managedByOwnerId };
  }
  if (user.role === "caretaker") {
    const staffScope = await getStaffAssignmentScope(userId, "caretaker", action);
    if (staffScope.hasAssignments) {
      return {
        filter: staffTenantFilter(staffScope),
        leaseFilter: staffLeaseFilter(staffScope),
        userId,
        role: user.role,
        managedByOwnerId,
        ...staffScope,
        staffAssignmentBacked: true,
      };
    }
    if (!managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const properties = await Property.find({ caretakerIds: userId, ownerId: managedByOwnerId })
      .select("_id")
      .lean();
    const assignedPropertyIds = properties.map((p) => String(p._id));
    return {
      filter: { propertyId: { $in: assignedPropertyIds }, ownerId: managedByOwnerId },
      leaseFilter: { propertyId: { $in: assignedPropertyIds }, ownerId: managedByOwnerId },
      userId,
      role: user.role,
      managedByOwnerId,
      assignedPropertyIds,
    };
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function tenantMatchesScope(
  tenant: { _id?: unknown; ownerId: string; propertyId: string },
  scope: TenantScope,
): boolean {
  if (scope.role === "owner") {
    return tenant.ownerId === scope.userId;
  }
  if (scope.role === "admin") {
    return (
      (scope.propertyScopeIds?.includes(tenant.propertyId) ?? false) ||
      (scope.assignedTenantIds?.includes(String(tenant._id ?? "")) ?? false)
    );
  }
  if (scope.role === "custodian") {
    if (scope.staffAssignmentBacked) {
      return (
        (scope.propertyScopeIds?.includes(tenant.propertyId) ?? false) ||
        (scope.assignedTenantIds?.includes(String(tenant._id ?? "")) ?? false)
      );
    }
    return tenant.ownerId === scope.managedByOwnerId;
  }
  if (scope.role === "system-admin") {
    return true;
  }
  if (scope.role !== "caretaker") {
    return false;
  }
  if (scope.staffAssignmentBacked) {
    return (
      (scope.propertyScopeIds?.includes(tenant.propertyId) ?? false) ||
      (scope.assignedTenantIds?.includes(String(tenant._id ?? "")) ?? false)
    );
  }
  return (
    tenant.ownerId === scope.managedByOwnerId &&
    (scope.assignedPropertyIds?.includes(tenant.propertyId) ?? false)
  );
}
