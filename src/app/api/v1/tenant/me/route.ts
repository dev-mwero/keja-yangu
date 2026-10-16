import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { TENANT_SAFE_FIELDS, Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive email").lean();
  if (!user?.isActive || user.role !== "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = String(user._id);
  let tenancy = await Tenant.findOne({ userId, deletedAt: null }).select(TENANT_SAFE_FIELDS).lean();

  // Heal the link for tenancies created before the userId bind existed.
  if (!tenancy && user.email) {
    tenancy = await Tenant.findOne({
      email: user.email.trim().toLowerCase(),
      deletedAt: null,
    })
      .select(TENANT_SAFE_FIELDS)
      .lean();
    if (tenancy) {
      await Tenant.updateOne({ _id: tenancy._id }, { $set: { userId } });
    }
  }

  if (!tenancy) {
    return NextResponse.json({ error: "No tenancy found" }, { status: 404 });
  }

  return NextResponse.json({ data: tenancy });
}
