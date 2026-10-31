import { isValidObjectId } from "mongoose";
import { User } from "@/models/User";

export async function validatePropertyStaffAssignments(
  ownerId: string,
  assignments: { caretakerIds?: string[]; custodianIds?: string[] },
): Promise<string | null> {
  const teams = [
    { field: "caretakerIds", role: "caretaker", ids: assignments.caretakerIds },
    { field: "custodianIds", role: "custodian", ids: assignments.custodianIds },
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
      isActive: true,
    })
      .select("_id")
      .lean();
    if (users.length !== ids.length) {
      return `${team.field} must reference active ${team.role}s assigned to this property owner`;
    }
  }

  return null;
}
