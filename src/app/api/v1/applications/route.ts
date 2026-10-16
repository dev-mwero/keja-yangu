import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { authenticate } from "@/lib/permissions";
import { applicationCreateInput } from "@/lib/schemas/application";
import { Application } from "@/models/Application";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive managedByOwnerId").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const role = user.role;
  if (role === "tenant") {
    filter.applicantUserId = String(user._id);
  } else if (role === "owner") {
    filter.ownerId = String(user._id);
  } else if (role === "custodian") {
    if (!user.managedByOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    filter.ownerId = user.managedByOwnerId;
  } else if (role === "caretaker") {
    if (!user.managedByOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const assigned = await Property.find({
      caretakerIds: String(user._id),
      ownerId: user.managedByOwnerId,
    })
      .select("_id")
      .lean();
    filter.ownerId = user.managedByOwnerId;
    filter.propertyId = { $in: assigned.map((p) => String(p._id)) };
  } else if (role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status");
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Application.countDocuments(filter),
  ]);

  // Resolve property titles so the dashboard table reads without a join.
  const propertyIds = [...new Set(items.map((a) => String(a.propertyId)).filter(Boolean))];
  const properties = propertyIds.length
    ? await Property.find({ _id: { $in: propertyIds } })
        .select("title")
        .lean()
    : [];
  const propertyTitleById = new Map(properties.map((p) => [String(p._id), String(p.title ?? "")]));

  const enriched = items.map((a) => ({
    ...a,
    propertyTitle: propertyTitleById.get(String(a.propertyId)) ?? "",
  }));

  return NextResponse.json(buildPaginationResult(enriched, total, page, limit));
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = applicationCreateInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid application payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive email").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "tenant") {
    return NextResponse.json({ error: "Only tenants can apply for a home" }, { status: 403 });
  }

  const property = await Property.findById(parsed.data.propertyId).select("_id ownerId").lean();
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const applicantUserId = String(user._id);
  const existing = await Application.findOne({
    propertyId: parsed.data.propertyId,
    applicantUserId,
    status: "pending",
  })
    .select("_id")
    .lean();
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending application for this home" },
      { status: 409 },
    );
  }

  const created = await Application.create({
    propertyId: parsed.data.propertyId,
    ownerId: property.ownerId,
    applicantUserId,
    applicantName: parsed.data.name,
    applicantEmail: parsed.data.email.trim().toLowerCase(),
    message: parsed.data.message ?? "",
    status: "pending",
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
