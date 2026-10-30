import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, CUSTODIAN_PRIVILEGES } from "@/lib/permissions";
import { User } from "@/models/User";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const custodianUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  privileges: z.array(z.enum(CUSTODIAN_PRIVILEGES)).optional(),
});

async function loadActorAndCustodian(request: NextRequest, id: string) {
  const auth = authenticate(request);
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  await connectToDatabase();
  const actor = await User.findById(auth.userId).select("role isActive managedByOwnerId").lean();
  if (!actor?.isActive) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (actor.role !== "owner" && actor.role !== "system-admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const custodian = await User.findOne({ _id: id, role: "custodian" });
  if (!custodian) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (actor.role !== "system-admin" && custodian.managedByOwnerId !== String(actor._id)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { actor, custodian };
}

/** Update a custodian's profile details. */
export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const result = await loadActorAndCustodian(request, id);
  if (result.error) return result.error;
  const { custodian } = result;

  const body = await request.json();
  const parsed = custodianUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid custodian payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.name !== undefined) custodian.name = parsed.data.name;
  if (parsed.data.phone !== undefined) custodian.phone = parsed.data.phone;
  if (parsed.data.privileges !== undefined) {
    custodian.privileges = parsed.data.privileges;
  }
  await custodian.save();

  return NextResponse.json({
    data: {
      id: String(custodian._id),
      name: custodian.name,
      email: custodian.email,
      phone: custodian.phone ?? "",
      managedByOwnerId: custodian.managedByOwnerId ?? "",
      privileges: custodian.privileges ?? [],
    },
  });
}

/**
 * Revoke a custodian's access. The account is retained (for audit/history) but
 * unlinked from the owner and deactivated.
 */
export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const result = await loadActorAndCustodian(request, id);
  if (result.error) return result.error;
  const { custodian } = result;

  custodian.managedByOwnerId = "";
  custodian.isActive = false;
  await custodian.save();

  return NextResponse.json({ data: { _id: id } });
}
