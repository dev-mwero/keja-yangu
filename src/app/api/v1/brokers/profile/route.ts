import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getBrokerProfile, upsertBrokerProfile } from "@/lib/brokers";
import { authenticate } from "@/lib/permissions";

const profileSchema = z.object({
  agencyName: z.string().optional(),
  licenseNumber: z.string().optional(),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Valid email is required"),
  counties: z.array(z.string()).optional(),
  specialties: z.array(z.string()).optional(),
  payoutMethod: z
    .object({
      payoutType: z.enum(["mpesa", "bank", "none"]),
      accountName: z.string().optional(),
      accountNumber: z.string().optional(),
      bankName: z.string().optional(),
    })
    .optional(),
});

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getBrokerProfile(auth.userId);
  if (!profile) {
    return NextResponse.json({ error: "Broker profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile });
}

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const profile = await upsertBrokerProfile(auth.userId, parsed.data);
    return NextResponse.json({ profile }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to update profile" },
      { status: 500 },
    );
  }
}

export const PATCH = POST;

