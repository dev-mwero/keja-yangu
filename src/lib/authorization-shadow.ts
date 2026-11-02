import { createHash } from "node:crypto";
import { type AuditRequestContext, writeAuditEvent } from "@/lib/audit";
import {
  type AuthorizationResult,
  evaluateActorPolicy,
  loadActorContext,
  type PolicyAction,
  type PolicyResource,
} from "@/lib/authorization";

export interface ShadowComparison {
  legacyAllowed: boolean;
  policy: AuthorizationResult;
}

export function shadowSampleRate(): number {
  const raw = Number(process.env.AUTHZ_SHADOW_SAMPLE_RATE ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, 1);
}

/**
 * Deterministic sampling keeps a given actor/action/scope pair either in or out
 * of the shadow report for the whole sampling window.
 */
export function shouldSampleShadow(rate: number, key: string): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const digest = createHash("sha256").update(key).digest();
  return digest.readUInt32BE(0) / 0xffffffff < rate;
}

function resourceKey(resource: PolicyResource | undefined): string {
  if (!resource) return "global";
  return [resource.propertyId ?? "", resource.blockId ?? "", resource.unitId ?? ""].join(":");
}

/**
 * Compares the legacy permission decision with the scoped policy result without
 * changing the response. Mismatches are written to the audit trail for the
 * Stage 1 shadow report.
 */
export async function compareAuthorizationShadow(input: {
  actorUserId: string;
  action: PolicyAction;
  resource?: PolicyResource;
  legacyAllowed: boolean;
  request?: AuditRequestContext;
  rate?: number;
}): Promise<ShadowComparison | null> {
  const rate = input.rate ?? shadowSampleRate();
  const key = `${input.actorUserId}:${input.action}:${resourceKey(input.resource)}`;
  if (!shouldSampleShadow(rate, key)) return null;

  const context = await loadActorContext(input.actorUserId);
  if (!context) return null;

  const policy = evaluateActorPolicy(context, input.action, input.resource);
  if (policy.allowed === input.legacyAllowed) return null;

  try {
    await writeAuditEvent({
      actor: { userId: input.actorUserId, role: context.actor.role },
      action: "authz.shadow.mismatch",
      entityType: "AuthorizationDecision",
      entityId: input.action,
      scope: {
        propertyId: input.resource?.propertyId,
        blockId: input.resource?.blockId,
        unitId: input.resource?.unitId,
      },
      before: {
        source: "legacy",
        allowed: input.legacyAllowed,
      },
      after: {
        source: "policy",
        allowed: policy.allowed,
        reason: policy.reason,
      },
      request: input.request,
    });
  } catch (error) {
    console.error("Authorization shadow comparison audit failed", error);
  }

  return { legacyAllowed: input.legacyAllowed, policy };
}
