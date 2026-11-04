import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeBroker, listBrokerAuthorizations } from "@/lib/brokers";
import { BROKER_SCOPE_TYPES } from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { User } from "@/models/User";

const authorizeSchema = z.object({
  brokerId: z.string().min(1, "brokerId is required"),
  scopeType: z.enum([...BROKER_SCOPE_TYPES]),
  scopeId: z.string().min(1, "scopeId is required"),
  propertyId: z.string().min(1, "propertyId is required"),
  validTo: z.string().datetime().optional().nullable(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const brokerIdParam = request.nextUrl.searchParams.get("brokerId");
  const propertyIdParam = request.nextUrl.searchParams.get("propertyId");
  const statusParam = request.nextUrl.searchParams.get("status") as any;

  // If user is a broker, restrict to their own authorizations
  const filterBrokerId = user.role === "broker" ? auth.userId : (brokerIdParam ?? undefined);

  const authorizations = await listBrokerAuthorizations({
    brokerId: filterBrokerId,
    propertyId: propertyIdParam ?? undefined,
    status: statusParam ?? undefined,
  });

  return NextResponse.json({ authorizations });
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (
    !user?.isActive ||
    (user.role !== "admin" && user.role !== "owner" && user.role !== "system-admin")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = authorizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const created = await authorizeBroker(
      { userId: auth.userId, role: user.role },
      {
        brokerId: parsed.data.brokerId,
        scopeType: parsed.data.scopeType,
        scopeId: parsed.data.scopeId,
        propertyId: parsed.data.propertyId,
        validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
        notes: parsed.data.notes,
      },
    );

    return NextResponse.json({ authorization: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to grant broker authorization" },
      { status: 400 },
    );
  }
}
