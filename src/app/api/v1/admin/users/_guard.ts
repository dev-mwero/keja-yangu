import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isRoleManagementEnabled } from "@/lib/features";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { User } from "@/models/User";

export interface RoleManagementActor {
  userId: string;
  role: "system-admin";
}

/**
 * Guards the users/roles surface. The actor is always re-read from the database
 * so a stale JWT (e.g. after a demotion) cannot exercise the previous role.
 * Returns 404 when the feature flag is off so the surface is not discoverable.
 */
export async function requireRoleManagementActor(
  request: NextRequest,
): Promise<NextResponse | RoleManagementActor> {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive tokenVersion").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((user.tokenVersion ?? 0) !== (auth.tokenVersion ?? 0)) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }
  if (user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isRoleManagementEnabled()) {
    return NextResponse.json({ error: "Role management is disabled" }, { status: 404 });
  }

  return { userId: String(user._id), role: "system-admin" };
}

/** Escapes user input before it is used inside a regular expression. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
