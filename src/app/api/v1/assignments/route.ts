import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isDuplicateKeyError, readJsonBody } from "@/app/api/v1/_helpers";
import { AssignmentError, type AssignmentView, grantAssignment } from "@/lib/assignments";
import {
  type ActorContext,
  evaluateActorPolicy,
  loadActorContext,
  POLICY_ACTIONS,
  type PolicyAction,
} from "@/lib/authorization";
import {
  ASSIGNMENT_ACCESS_ROLES,
  ASSIGNMENT_SCOPE_TYPES,
  ASSIGNMENT_STATUSES,
} from "@/lib/domain-enums";
import { authenticate } from "@/lib/permissions";
import { loadPropertyResource } from "@/lib/policy-resources";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { ManagementAssignment } from "@/models/ManagementAssignment";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const policyActionSchema = z.custom<PolicyAction>(
  (value) => typeof value === "string" && POLICY_ACTIONS.includes(value as PolicyAction),
  { message: "Unknown policy action" },
);

const grantInput = z.object({
  principalUserId: z.string().regex(OBJECT_ID),
  accessRole: z.enum(ASSIGNMENT_ACCESS_ROLES),
  scopeType: z.enum(ASSIGNMENT_SCOPE_TYPES),
  propertyId: z.string().regex(OBJECT_ID),
  blockId: z.string().regex(OBJECT_ID).optional(),
  unitId: z.string().regex(OBJECT_ID).optional(),
  permissions: z.array(policyActionSchema).min(1).max(100),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

interface RouteActor {
  authUserId: string;
  context: ActorContext;
}

async function resolveActor(request: NextRequest): Promise<RouteActor | NextResponse> {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const context = await loadActorContext(auth.userId);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return { authUserId: auth.userId, context };
}

function serializeAssignment(assignment: AssignmentView) {
  return {
    id: assignment._id,
    principalUserId: assignment.principalUserId,
    accessRole: assignment.accessRole,
    scopeType: assignment.scopeType,
    propertyId: assignment.propertyId,
    blockId: assignment.blockId,
    unitId: assignment.unitId,
    permissions: assignment.permissions,
    status: assignment.status,
    startsAt: assignment.startsAt ?? null,
    endsAt: assignment.endsAt ?? null,
    reason: assignment.reason ?? "",
    grantedByUserId: assignment.grantedByUserId ?? "",
    grantedAt: assignment.grantedAt ?? null,
    acceptedAt: assignment.acceptedAt ?? null,
    revokedByUserId: assignment.revokedByUserId ?? "",
    revokedAt: assignment.revokedAt ?? null,
  };
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AssignmentError) {
    const status = {
      unauthorized: 401,
      forbidden: 403,
      invalid: 400,
      "not-found": 404,
      conflict: 409,
    }[error.code];
    return NextResponse.json({ error: error.message }, { status });
  }
  if (isDuplicateKeyError(error)) {
    return NextResponse.json(
      { error: "An active assignment already covers that scope" },
      { status: 409 },
    );
  }
  throw error;
}

export async function GET(request: NextRequest) {
  const actor = await resolveActor(request);
  if (actor instanceof NextResponse) return actor;

  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const statusParam = request.nextUrl.searchParams.get("status");
  const status = statusParam ? z.enum(ASSIGNMENT_STATUSES).safeParse(statusParam) : null;
  if (status && !status.success) {
    return NextResponse.json({ error: "Invalid assignment status" }, { status: 400 });
  }

  let filter: Record<string, unknown>;
  if (propertyId) {
    if (!isValidObjectId(propertyId)) {
      return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
    }
    const resource = await loadPropertyResource(propertyId);
    if (!resource.ok) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    const check = evaluateActorPolicy(actor.context, "assignment:read", resource.resource);
    if (!check.allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter = { propertyId };
  } else {
    filter = { principalUserId: actor.authUserId };
  }
  if (status?.success) filter.status = status.data;

  const assignments = (await ManagementAssignment.find(filter)
    .sort({ createdAt: -1 })
    .lean()) as unknown as AssignmentView[];

  return NextResponse.json({ data: assignments.map(serializeAssignment) });
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const actor = await resolveActor(request);
  if (actor instanceof NextResponse) return actor;

  const parsed = grantInput.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid assignment payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await grantAssignment(actor.authUserId, parsed.data);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
