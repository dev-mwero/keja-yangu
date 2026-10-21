import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { propertyTitleMap, readJsonBody, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { serializeDocument } from "@/lib/documents";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { documentInput } from "@/lib/schemas";
import { Property } from "@/models/Property";
import { PropertyDocument } from "@/models/PropertyDocument";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const authError = await requirePermission(request, "document:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const filter: Record<string, unknown> = {};
  if (actor.role === "tenant") {
    if (actor.tenantIds.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    // Tenant-bound documents plus property-scope documents of every property
    // the tenant is bound to.
    filter.$or = [
      { scope: "tenant", tenantId: { $in: actor.tenantIds } },
      { scope: "property", propertyId: { $in: actor.tenantPropertyIds } },
    ];
  } else if (actor.role === "owner") {
    filter.ownerId = actor.userId;
  } else if (actor.role === "caretaker") {
    filter.ownerId = actor.managedByOwnerId;
    filter.propertyId = { $in: actor.assignedPropertyIds };
  }

  const [documents, total] = await Promise.all([
    PropertyDocument.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PropertyDocument.countDocuments(filter),
  ]);
  const titles = await propertyTitleMap(documents.map((document) => document.propertyId));

  return NextResponse.json(
    buildPaginationResult(
      documents.map((document) => serializeDocument(document, titles)),
      total,
      page,
      limit,
    ),
  );
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, { windowMs: 60_000, limit: 30 });
  if (limited instanceof NextResponse) return limited;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  // Caretakers and custodians write for the owner they manage; owners and
  // system-admins pass without a resource.
  const authError = await requirePermission(
    request,
    "document:manage",
    actor.role === "caretaker" ? { resource: { ownerId: actor.managedByOwnerId } } : undefined,
  );
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = documentInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid document payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, category, scope, sizeLabel } = parsed.data;
  const propertyId = parsed.data.propertyId || "";
  const tenantId = parsed.data.tenantId || "";

  if (scope === "tenant" && !tenantId) {
    return NextResponse.json(
      { error: "Tenant-scope documents require a tenantId" },
      { status: 400 },
    );
  }
  if (scope === "property" && !propertyId) {
    return NextResponse.json(
      { error: "Property-scope documents require a propertyId" },
      { status: 400 },
    );
  }

  const portfolioOwnerId =
    actor.role === "caretaker" || actor.role === "custodian"
      ? actor.managedByOwnerId
      : actor.userId;

  if (actor.role === "caretaker" && propertyId && !actor.assignedPropertyIds.includes(propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let ownerId = portfolioOwnerId;
  if (propertyId) {
    const property = await Property.findById(propertyId).select("ownerId").lean();
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (actor.role === "system-admin") {
      ownerId = property.ownerId;
    } else if (property.ownerId !== portfolioOwnerId) {
      return NextResponse.json(
        { error: "You do not have access to this property" },
        { status: 403 },
      );
    }
  }

  let resolvedPropertyId = propertyId;
  if (tenantId) {
    const tenant = await Tenant.findById(tenantId).select("ownerId propertyId").lean();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (actor.role !== "system-admin" && tenant.ownerId !== portfolioOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      actor.role === "caretaker" &&
      tenant.propertyId &&
      !actor.assignedPropertyIds.includes(tenant.propertyId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (propertyId && tenant.propertyId && tenant.propertyId !== propertyId) {
      return NextResponse.json(
        { error: "Tenant does not belong to the selected property" },
        { status: 400 },
      );
    }
    resolvedPropertyId = resolvedPropertyId || tenant.propertyId;
  }

  const uploader = await User.findById(actor.userId).select("name").lean();
  const document = await PropertyDocument.create({
    name,
    category,
    scope,
    propertyId: resolvedPropertyId,
    tenantId,
    ownerId,
    uploadedById: actor.userId,
    uploadedByName: uploader?.name ?? "",
    sizeLabel,
  });

  const created = await PropertyDocument.findById(String(document._id)).lean();
  if (!created) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  const titles = await propertyTitleMap([created.propertyId]);

  console.info(
    `[documents] create actor=${actor.userId} role=${actor.role} document=${String(document._id)}`,
  );

  return NextResponse.json({ data: serializeDocument(created, titles) }, { status: 201 });
}
