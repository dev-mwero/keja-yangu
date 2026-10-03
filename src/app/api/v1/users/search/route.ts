import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { User } from "@/models/User";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const actor = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!actor?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isOwnerOrAdmin = actor.role === "owner" || actor.role === "system-admin";
  const isCaretakerWithTenants =
    actor.role === "caretaker" && (actor.privileges ?? []).includes("manage_tenants");
  if (!isOwnerOrAdmin && !isCaretakerWithTenants) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("email")?.trim();
  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  if (!email && !phone) {
    return NextResponse.json({ error: "Provide an email or phone parameter" }, { status: 400 });
  }

  const query = email
    ? { email: { $regex: new RegExp(`^${escapeRegExp(email)}$`, "i") } }
    : { phone };

  const found = await User.findOne(query).select("name email role isActive isVerified").lean();

  const data = found
    ? [
        {
          id: String(found._id),
          name: found.name,
          email: found.email,
          role: found.role,
          isActive: found.isActive,
          hasVerifiedEmail: found.isVerified,
        },
      ]
    : [];

  return NextResponse.json({ data });
}
