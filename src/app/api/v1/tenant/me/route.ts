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
  let tenancies = await Tenant.find({ userId, deletedAt: null }).select(TENANT_SAFE_FIELDS).lean();

  // Heal the link for tenancies created before the userId bind existed.
  if (tenancies.length === 0 && user.email) {
    const legacy = await Tenant.find({
      email: user.email.trim().toLowerCase(),
      deletedAt: null,
    })
      .select(TENANT_SAFE_FIELDS)
      .lean();
    if (legacy.length > 0) {
      await Tenant.updateMany({ _id: { $in: legacy.map((t) => t._id) } }, { $set: { userId } });
      tenancies = legacy;
    }
  }

  if (tenancies.length === 0) {
    return NextResponse.json({ error: "No tenancy found" }, { status: 404 });
  }

  return NextResponse.json({ data: tenancies });
}
