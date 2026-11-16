import { connectToDatabase } from "@/lib/mongoose";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";

/**
 * Derives the "managing owner" for a staff user from their active assignments
 * and the ownership of the properties they are assigned to. Replaces the
 * retired `User.managedByOwnerId` field.
 */
export async function getManagedOwnerId(userId: string): Promise<string> {
  await connectToDatabase();
  const assignments = await ManagementAssignment.find({
    principalUserId: userId,
    status: "active",
  })
    .select("propertyId")
    .lean();
  const propertyIds = [...new Set(assignments.map((a) => String(a.propertyId)))];
  if (propertyIds.length === 0) return "";
  const properties = await Property.find({ _id: { $in: propertyIds } })
    .select("ownerId")
    .lean();
  const owners = new Set(properties.map((p) => String(p.ownerId ?? "")).filter(Boolean));
  return [...owners][0] ?? "";
}

/**
 * Returns the user ids of active staff of `role` bound to properties owned by
 * `ownerId`, derived from assignments (replaces legacy managedByOwnerId filter).
 */
export async function getStaffIdsForOwner(
  ownerId: string,
  role: "caretaker" | "custodian",
): Promise<string[]> {
  await connectToDatabase();
  if (!ownerId) return [];
  const properties = await Property.find({ ownerId }).select("_id").lean();
  const propertyIds = properties.map((p) => String(p._id));
  if (propertyIds.length === 0) return [];
  const assignments = await ManagementAssignment.find({
    propertyId: { $in: propertyIds },
    accessRole: role,
    status: "active",
  })
    .select("principalUserId")
    .lean();
  return [...new Set(assignments.map((a) => String(a.principalUserId)))];
}

export async function getPropertyStaffIds(propertyId: string): Promise<{
  caretakerIds: string[];
  custodianIds: string[];
}> {
  await connectToDatabase();
  const assignments = await ManagementAssignment.find({
    propertyId,
    status: "active",
    accessRole: { $in: ["caretaker", "custodian"] },
  })
    .select("principalUserId accessRole")
    .lean();
  const caretakerIds = [
    ...new Set(
      assignments.filter((a) => a.accessRole === "caretaker").map((a) => String(a.principalUserId)),
    ),
  ];
  const custodianIds = [
    ...new Set(
      assignments.filter((a) => a.accessRole === "custodian").map((a) => String(a.principalUserId)),
    ),
  ];
  return { caretakerIds, custodianIds };
}

/**
 * Batch-derives caretaker/custodian assignment ids for a set of properties.
 * Used to keep the legacy display fields populated in API responses without
 * storing them on the Property document.
 */
export async function getPropertyStaffMap(
  propertyIds: string[],
): Promise<Map<string, { caretakerIds: string[]; custodianIds: string[] }>> {
  await connectToDatabase();
  const map = new Map<string, { caretakerIds: string[]; custodianIds: string[] }>();
  if (propertyIds.length === 0) return map;
  const assignments = await ManagementAssignment.find({
    propertyId: { $in: propertyIds },
    status: "active",
    accessRole: { $in: ["caretaker", "custodian"] },
  })
    .select("propertyId principalUserId accessRole")
    .lean();
  for (const assignment of assignments) {
    const propertyId = String(assignment.propertyId);
    const entry = map.get(propertyId) ?? { caretakerIds: [], custodianIds: [] };
    if (assignment.accessRole === "caretaker") {
      entry.caretakerIds.push(String(assignment.principalUserId));
    } else {
      entry.custodianIds.push(String(assignment.principalUserId));
    }
    map.set(propertyId, entry);
  }
  for (const entry of map.values()) {
    entry.caretakerIds = [...new Set(entry.caretakerIds)];
    entry.custodianIds = [...new Set(entry.custodianIds)];
  }
  return map;
}

/** Returns the property ids where `userId` holds an active assignment of `role`. */
export async function getAssignedPropertyIds(
  userId: string,
  role: "caretaker" | "custodian" | "admin",
): Promise<string[]> {
  await connectToDatabase();
  const assignments = await ManagementAssignment.find({
    principalUserId: userId,
    accessRole: role,
    status: "active",
  })
    .select("propertyId")
    .lean();
  return [...new Set(assignments.map((a) => String(a.propertyId)))];
}
