import { isValidObjectId } from "mongoose";
import { caretakerMigrationActions } from "@/lib/assignment-backfill";
import { roleMaximumActions } from "@/lib/authorization-policy";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { User } from "@/models/User";

/**
 * Mirrors a property's staff lists into `ManagementAssignment` rows — the only
 * authorization source. Caretaker permissions are derived from the user's
 * legacy privilege set so privilege changes keep working; custodians get their
 * role maximum.
 */
export async function syncPropertyStaffAssignments(input: {
  propertyId: string;
  caretakerIds: string[];
  custodianIds: string[];
  grantedByUserId: string;
}): Promise<void> {
  const now = new Date();
  const caretakerIds = [...new Set(input.caretakerIds)];
  const custodianIds = [...new Set(input.custodianIds)];
  const principals = [...new Set([...caretakerIds, ...custodianIds])];

  // Revoke staff no longer bound to this property (never touches admins).
  await ManagementAssignment.updateMany(
    {
      propertyId: input.propertyId,
      accessRole: { $in: ["caretaker", "custodian"] },
      status: "active",
      ...(principals.length > 0 ? { principalUserId: { $nin: principals } } : {}),
    },
    {
      $set: {
        status: "revoked",
        revokedAt: now,
        revokedByUserId: input.grantedByUserId,
      },
    },
  );

  if (principals.length === 0) return;

  const users = await User.find({ _id: { $in: principals } })
    .select("_id role privileges")
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  const upsert = async (principalUserId: string, accessRole: "caretaker" | "custodian") => {
    const user = usersById.get(principalUserId);
    if (!user) return;
    if (accessRole === "caretaker" && user.role !== "caretaker") return;
    if (accessRole === "custodian" && user.role !== "custodian") return;

    const permissions =
      accessRole === "caretaker"
        ? caretakerMigrationActions((user.privileges ?? []) as string[]).actions
        : roleMaximumActions("custodian");

    // Deactivate any other active row for this principal/property/role so the
    // partial unique index never sees two active rows.
    await ManagementAssignment.updateMany(
      {
        principalUserId,
        accessRole,
        propertyId: input.propertyId,
        status: "active",
      },
      { $set: { status: "revoked", revokedAt: now, revokedByUserId: input.grantedByUserId } },
    );
    await ManagementAssignment.updateOne(
      {
        principalUserId,
        accessRole,
        scopeType: "property",
        propertyId: input.propertyId,
        blockId: "",
        unitId: "",
      },
      {
        $set: {
          permissions: [...permissions],
          status: "active",
          startsAt: now,
          endsAt: null,
          grantedByUserId: input.grantedByUserId,
          grantedAt: now,
          acceptedAt: now,
          revokedAt: null,
          revokedByUserId: "",
          reason: "Property staff binding",
          source: "system",
        },
      },
      { upsert: true },
    );
  };

  for (const id of caretakerIds) await upsert(id, "caretaker");
  for (const id of custodianIds) await upsert(id, "custodian");
}

/**
 * Re-derives permissions on a caretaker's existing property assignments after
 * their privilege set changes.
 */
export async function syncCaretakerPrivilegeAssignments(
  caretakerId: string,
  privileges: string[],
  grantedByUserId: string,
): Promise<void> {
  const permissions = caretakerMigrationActions(privileges).actions;
  await ManagementAssignment.updateMany(
    { principalUserId: caretakerId, accessRole: "caretaker", status: "active" },
    { $set: { permissions: [...permissions], grantedByUserId, grantedAt: new Date() } },
  );
}

export async function validatePropertyStaffAssignments(
  ownerId: string,
  assignments: { caretakerIds?: string[]; custodianIds?: string[] },
  retainedAssignments: { caretakerIds?: string[]; custodianIds?: string[] } = {},
): Promise<string | null> {
  const teams = [
    {
      field: "caretakerIds",
      role: "caretaker",
      ids: assignments.caretakerIds,
      retainedIds: retainedAssignments.caretakerIds ?? [],
    },
    {
      field: "custodianIds",
      role: "custodian",
      ids: assignments.custodianIds,
      retainedIds: retainedAssignments.custodianIds ?? [],
    },
  ] as const;

  for (const team of teams) {
    const ids = team.ids;
    if (ids === undefined) continue;

    if (new Set(ids).size !== ids.length) {
      return `${team.field} cannot contain duplicate user IDs`;
    }
    if (ids.some((id) => !isValidObjectId(id))) {
      return `${team.field} must contain valid user IDs`;
    }
    if (ids.length === 0) continue;

    const users = await User.find({
      _id: { $in: ids },
      role: team.role,
      managedByOwnerId: ownerId,
    })
      .select("_id isActive isVerified")
      .lean();
    const retainedIds = new Set(team.retainedIds);
    const eligibleIds = new Set(
      users
        .filter(
          (user) =>
            (user.isActive !== false && user.isVerified !== false) ||
            retainedIds.has(String(user._id)),
        )
        .map((user) => String(user._id)),
    );
    if (ids.some((id) => !eligibleIds.has(id))) {
      return `${team.field} must reference active ${team.role}s assigned to this property owner`;
    }
  }

  return null;
}
