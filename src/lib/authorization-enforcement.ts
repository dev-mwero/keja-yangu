import type { NextRequest } from "next/server";
import { writeAuditEvent } from "@/lib/audit";
import {
  type AuthorizationResult,
  evaluateActorPolicy,
  isResourceFreePolicyAction,
  loadActorContext,
  type PolicyAction,
  type PolicyResource,
} from "@/lib/authorization";
import type { Action } from "@/lib/permissions";
import { loadUnitResource } from "@/lib/policy-resources";

export interface EnforcementResource {
  _id?: unknown;
  ownerId?: string;
  propertyId?: string;
  blockId?: string;
  unitId?: string;
  lifecycleState?: "draft" | "active" | "archived" | "merged";
}

function stringId(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "toString" in value) {
    const rendered = String(value);
    return rendered.length > 0 ? rendered : undefined;
  }
  return undefined;
}

/**
 * Route-family enforcement is opt-in so a deployment can move one family at a
 * time. `*` enables every family and is intended for staging only.
 */
export function enforcedRouteFamilies(): Set<string> {
  return new Set(
    (process.env.AUTHZ_ENFORCE_ROUTE_FAMILIES ?? "")
      .split(",")
      .map((family) => family.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function routeFamily(request: NextRequest): string {
  const match = request.nextUrl.pathname.match(/^\/api\/v1\/([^/]+)/);
  return (match?.[1] ?? "").toLowerCase();
}

export function isRouteFamilyEnforced(request: NextRequest): boolean {
  const families = enforcedRouteFamilies();
  return families.has("*") || families.has(routeFamily(request));
}

/**
 * Converts the legacy route resource into the canonical policy scope. Property
 * documents expose `_id` rather than `propertyId`, so infer it only when the
 * route has not already supplied a narrower scope.
 */
export function toPolicyResource(
  resource: EnforcementResource | undefined,
): PolicyResource | undefined {
  if (!resource) return undefined;
  const propertyId =
    stringId(resource.propertyId) ?? (resource.unitId ? undefined : stringId(resource._id));
  const blockId = stringId(resource.blockId);
  const unitId = stringId(resource.unitId);
  if (!propertyId) return undefined;
  return {
    propertyId,
    ...(blockId ? { blockId } : {}),
    ...(unitId ? { unitId } : {}),
    ...(resource.lifecycleState ? { lifecycleState: resource.lifecycleState } : {}),
  };
}

async function resolvePolicyResource(
  resource: EnforcementResource,
): Promise<PolicyResource | null> {
  const requested = toPolicyResource(resource);
  if (!requested) return null;
  if (!requested.unitId) return requested;

  const resolved = await loadUnitResource(requested.unitId);
  if (!resolved.ok || resolved.resource.propertyId !== requested.propertyId) return null;
  if (requested.blockId && resolved.resource.blockId !== requested.blockId) return null;

  return {
    ...resolved.resource,
    lifecycleState: requested.lifecycleState ?? resolved.resource.lifecycleState,
  };
}

function isLegacyActorWithoutAssignments(
  context: NonNullable<Awaited<ReturnType<typeof loadActorContext>>>,
): boolean {
  if (context.actor.role === "system-admin" || context.actor.role === "admin") return false;
  return context.assignments.length === 0;
}

/**
 * Returns `null` when the caller should keep the legacy decision. A non-null
 * result is authoritative for the enabled route family.
 */
export async function enforceScopedAuthorization(input: {
  request: NextRequest;
  actorUserId: string;
  action: Action;
  resource?: EnforcementResource;
  legacyAllowed: boolean;
}): Promise<AuthorizationResult | null> {
  if (!isRouteFamilyEnforced(input.request)) return null;

  const requestedResource = toPolicyResource(input.resource);
  if (!requestedResource && !isResourceFreePolicyAction(input.action)) return null;

  const context = await loadActorContext(input.actorUserId);
  if (!context) return null;

  // Tenants retain legacy self-service routing until tenant loaders are wired,
  // and legacy staff without assignments stay on the compatibility path.
  if (context.actor.role === "tenant") return null;
  if (isLegacyActorWithoutAssignments(context)) return null;

  const policyResource = input.resource
    ? await resolvePolicyResource(input.resource)
    : requestedResource;
  if (requestedResource?.unitId && !policyResource) {
    return { allowed: false, reason: "inconsistent-resource" };
  }

  const decision = evaluateActorPolicy(
    context,
    input.action as PolicyAction,
    policyResource ?? undefined,
  );
  if (decision.allowed !== input.legacyAllowed) {
    try {
      await writeAuditEvent({
        actor: { userId: context.actor.userId, role: context.actor.role },
        action: "authz.enforce.mismatch",
        entityType: "AuthorizationDecision",
        entityId: input.action,
        scope: {
          propertyId: policyResource?.propertyId,
          blockId: policyResource?.blockId,
          unitId: policyResource?.unitId,
        },
        before: { source: "legacy", allowed: input.legacyAllowed },
        after: { source: "policy", allowed: decision.allowed, reason: decision.reason },
        request: {
          ip: input.request.headers.get("x-forwarded-for"),
          userAgent: input.request.headers.get("user-agent"),
        },
      });
    } catch (error) {
      console.error("Authorization enforcement audit failed", error);
    }
  }

  return decision;
}
