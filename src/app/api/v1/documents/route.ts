import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { propertyTitleMap, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { serializeDocument } from "@/lib/documents";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { PropertyDocument } from "@/models/PropertyDocument";

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
