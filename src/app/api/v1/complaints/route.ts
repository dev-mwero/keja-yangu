import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  propertyTitleMap,
  readJsonBody,
  resolveDashboardActor,
  unitNameMap,
} from "@/app/api/v1/_helpers";
import { serializeComplaint } from "@/lib/complaints";
import { COMPLAINT_STATUSES } from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import { notifyComplaintCreated } from "@/lib/notifications";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { complaintInput } from "@/lib/schemas";
import { Complaint } from "@/models/Complaint";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const status = request.nextUrl.searchParams.get("status");

  if (status && !(COMPLAINT_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid complaint status" }, { status: 400 });
  }

  const authError = await requirePermission(request, "complaint:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const filter: Record<string, unknown> = {};
  if (actor.role === "tenant") {
    if (actor.tenantIds.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.tenantId = { $in: actor.tenantIds };
  } else if (actor.role === "owner") {
    filter.ownerId = actor.userId;
  } else if (actor.role === "caretaker") {
    filter.ownerId = actor.managedByOwnerId;
    filter.propertyId = { $in: actor.assignedPropertyIds };
  } else if (actor.role === "custodian") {
    // Custodians are owner-delegates: only the managing owner's portfolio.
    filter.ownerId = actor.managedByOwnerId;
  }
  if (status) filter.status = status;

  const [complaints, total] = await Promise.all([
    Complaint.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Complaint.countDocuments(filter),
  ]);
  const [titles, unitNames] = await Promise.all([
    propertyTitleMap(complaints.map((complaint) => complaint.propertyId)),
    unitNameMap(complaints.map((complaint) => complaint.unitId)),
  ]);

  return NextResponse.json(
    buildPaginationResult(
      complaints.map((document) => serializeComplaint(document, titles, unitNames)),
      total,
      page,
      limit,
    ),
  );
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 10 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "complaint:create");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = complaintInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid complaint payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;
  if (actor.role !== "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await Tenant.find({ userId: actor.userId }).select("_id propertyId ownerId").lean();
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No active tenancy found. Contact your landlord to be linked to a property." },
      { status: 403 },
    );
  }

  const propertyIds = [...new Set(rows.map((row) => row.propertyId))];
  let propertyId = parsed.data.propertyId;
  let row: (typeof rows)[number] | undefined;
  if (propertyIds.length === 1) {
    propertyId = propertyIds[0];
    row = rows.find((candidate) => candidate.propertyId === propertyId);
  } else {
    if (!propertyId) {
      return NextResponse.json(
        { error: "Property is required — your account maps to multiple properties" },
        { status: 400 },
      );
    }
    row = rows.find((candidate) => candidate.propertyId === propertyId);
    if (!row) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Resolve the unit the actor currently occupies at this property (same rule
  // the allocation service uses). No occupancy → "" (property-level complaint).
  const occupiedUnit = await Unit.findOne({
    propertyId,
    tenantId: actor.userId,
    status: "occupied",
    deletedAt: null,
  })
    .select("_id")
    .lean();

  const complaint = await Complaint.create({
    tenantId: String(row?._id) ?? "",
    propertyId: propertyId ?? "",
    ownerId: row?.ownerId ?? "",
    unitId: occupiedUnit ? String(occupiedUnit._id) : "",
    subject: parsed.data.subject,
    category: parsed.data.category,
    message: parsed.data.message,
    priority: parsed.data.priority,
    status: "open",
  });

  const created = await Complaint.findById(String(complaint._id)).lean();
  if (!created) {
    return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
  }
  await notifyComplaintCreated(created);
  const [titles, unitNames] = await Promise.all([
    propertyTitleMap([created.propertyId]),
    unitNameMap([created.unitId]),
  ]);

  console.info(
    `[complaints] create actor=${actor.userId} role=${actor.role} complaint=${String(complaint._id)}`,
  );

  return NextResponse.json(
    { data: serializeComplaint(created, titles, unitNames) },
    { status: 201 },
  );
}
