import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, getAdminAssignmentScope } from "@/lib/permissions";
import { resolveUserByContact } from "@/lib/user-identity";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

const TEAM_ROLES = ["caretaker", "custodian"] as const;

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

  const isOwnerOrAdmin =
    actor.role === "owner" || actor.role === "admin" || actor.role === "system-admin";
  const isCustodian = actor.role === "custodian" && Boolean(actor.managedByOwnerId);
  const isCaretakerWithTenants =
    actor.role === "caretaker" && (actor.privileges ?? []).includes("manage_tenants");
  if (!isOwnerOrAdmin && !isCustodian && !isCaretakerWithTenants) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = request.nextUrl.searchParams.get("email")?.trim();
  const phone = request.nextUrl.searchParams.get("phone")?.trim();
  const requestedRole = request.nextUrl.searchParams.get("role");
  const ownerId = request.nextUrl.searchParams.get("ownerId")?.trim();
  if (!email && !phone) {
    return NextResponse.json({ error: "Provide an email or phone parameter" }, { status: 400 });
  }

  if (requestedRole && !TEAM_ROLES.includes(requestedRole as (typeof TEAM_ROLES)[number])) {
    return NextResponse.json({ error: "Invalid team role" }, { status: 400 });
  }
  if (
    requestedRole &&
    actor.role !== "owner" &&
    actor.role !== "custodian" &&
    actor.role !== "admin" &&
    actor.role !== "system-admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let portfolioOwnerId: string | undefined;
  if (actor.role === "owner") {
    portfolioOwnerId = String(actor._id);
    if (ownerId && ownerId !== portfolioOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (actor.role === "custodian") {
    portfolioOwnerId = actor.managedByOwnerId ?? "";
    if (ownerId && ownerId !== portfolioOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (actor.role === "admin") {
    if (ownerId) {
      const scope = await getAdminAssignmentScope(String(actor._id), "property:read" as never);
      const assignedProperties = scope.assignedPropertyIds.length
        ? await Property.find({ _id: { $in: scope.assignedPropertyIds } })
            .select("ownerId")
            .lean()
        : [];
      const allowedOwners = new Set(assignedProperties.map((property) => String(property.ownerId)));
      if (!allowedOwners.has(ownerId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      portfolioOwnerId = ownerId;
    } else if (requestedRole) {
      return NextResponse.json(
        { error: "ownerId is required when checking a team member" },
        { status: 400 },
      );
    }
  } else if (actor.role === "system-admin" && ownerId) {
    const owner = await User.findOne({ _id: ownerId, role: "owner", isActive: true })
      .select("_id")
      .lean();
    if (!owner) {
      return NextResponse.json(
        { error: "ownerId must reference an active owner" },
        { status: 400 },
      );
    }
    portfolioOwnerId = ownerId;
  } else if (requestedRole && actor.role === "system-admin") {
    return NextResponse.json(
      { error: "ownerId is required when checking a team member" },
      { status: 400 },
    );
  }

  const identity = await resolveUserByContact({ email, phone });
  if (!identity.ok) {
    return NextResponse.json(
      { error: identity.message },
      { status: identity.kind === "identity-conflict" ? 409 : 400 },
    );
  }
  const found = identity.user;

  const data = found
    ? [
        {
          id: String(found._id ?? found.id ?? ""),
          name: found.name ?? "",
          email: found.email,
          role: found.role,
          isActive: found.isActive !== false,
          hasVerifiedEmail: found.isVerified === true,
          ...(requestedRole
            ? {
                canLink:
                  found.role === requestedRole &&
                  (!portfolioOwnerId ||
                    !found.managedByOwnerId ||
                    found.managedByOwnerId === portfolioOwnerId) &&
                  ((found.isActive !== false && found.isVerified !== false) || Boolean(email)),
                linkReason:
                  found.role !== requestedRole
                    ? "This contact is already registered to a different role."
                    : portfolioOwnerId &&
                        found.managedByOwnerId &&
                        found.managedByOwnerId !== portfolioOwnerId
                      ? "This account cannot be linked to this portfolio."
                      : (found.isActive === false || found.isVerified === false) && !email
                        ? "An email address is required to reactivate this account."
                        : undefined,
              }
            : {}),
        },
      ]
    : [];

  return NextResponse.json({ data });
}
