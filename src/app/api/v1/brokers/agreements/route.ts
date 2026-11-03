import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createCommissionAgreement } from "@/lib/brokers";
import { BROKER_SCOPE_TYPES, COMMISSION_BASES } from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { CommissionAgreement } from "@/models/CommissionAgreement";
import { User } from "@/models/User";

const agreementSchema = z.object({
  brokerId: z.string().min(1, "brokerId is required"),
  scopeType: z.enum([...BROKER_SCOPE_TYPES]),
  scopeId: z.string().min(1, "scopeId is required"),
  propertyId: z.string().min(1, "propertyId is required"),
  basis: z.enum([...COMMISSION_BASES]).optional(),
  rateBps: z.number().min(0).max(10000).optional(),
  fixedAmountMinor: z.number().min(0).optional(),
  currency: z.string().optional(),
  payerBillingAccountId: z.string().optional(),
  autoActivate: z.boolean().optional(),
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
  const statusParam = request.nextUrl.searchParams.get("status");

  const query: Record<string, any> = {};
  if (user.role === "broker") {
    query.brokerId = auth.userId;
  } else if (brokerIdParam) {
    query.brokerId = brokerIdParam;
  }

  if (propertyIdParam) query.propertyId = propertyIdParam;
  if (statusParam) query.status = statusParam;

  const agreements = await CommissionAgreement.find(query).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ agreements });
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
    const parsed = agreementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const created = await createCommissionAgreement(
      { userId: auth.userId, role: user.role },
      parsed.data,
    );

    return NextResponse.json({ agreement: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create commission agreement" },
      { status: 400 },
    );
  }
}

