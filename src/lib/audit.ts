import { createHash } from "node:crypto";
import { connectToDatabase } from "@/lib/mongoose";
import { AuditEvent } from "@/models/AuditEvent";

const REDACTED = "[redacted]";
const SENSITIVE_KEY_PATTERN =
  /(password|passcode|secret|token|authorization|cookie|apikey|api_key|national.?id)/i;

export function redactAuditValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactAuditValue(item, depth + 1));
  if (typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactAuditValue(entry, depth + 1);
  }
  return output;
}

export interface AuditActor {
  userId: string;
  role: string;
}

export interface AuditScope {
  propertyId?: string;
  blockId?: string;
  unitId?: string;
}

export interface AuditRequestContext {
  requestId?: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface WriteAuditEventInput {
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId?: string;
  scope?: AuditScope;
  before?: unknown;
  after?: unknown;
  request?: AuditRequestContext;
}

function hashValue(value: string | null | undefined): string {
  if (!value) return "";
  return createHash("sha256").update(value).digest("hex");
}

export async function writeAuditEvent(input: WriteAuditEventInput): Promise<void> {
  await connectToDatabase();
  await AuditEvent.create({
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? "",
    scope: {
      propertyId: input.scope?.propertyId ?? "",
      blockId: input.scope?.blockId ?? "",
      unitId: input.scope?.unitId ?? "",
    },
    before: input.before === undefined ? null : redactAuditValue(input.before),
    after: input.after === undefined ? null : redactAuditValue(input.after),
    requestId: input.request?.requestId ?? "",
    ipHash: hashValue(input.request?.ip),
    userAgentHash: hashValue(input.request?.userAgent),
  });
}
