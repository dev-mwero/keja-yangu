import {
  buildLegacyReadinessReport,
  type ReadinessAssignment,
  type ReadinessBillingAccount,
  type ReadinessBlock,
  type ReadinessProperty,
  type ReadinessUnit,
  type ReadinessUser,
} from "@/lib/legacy-readiness-report";
import { connectToDatabase } from "@/lib/mongoose";
import { BillingAccount } from "@/models/BillingAccount";
import { Block } from "@/models/Block";
import { ManagementAssignment } from "@/models/ManagementAssignment";
import { Property } from "@/models/Property";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

export {
  buildLegacyReadinessReport,
  type LegacyReadinessInput,
  type LegacyReadinessReport,
  type ReadinessAssignment,
  type ReadinessBillingAccount,
  type ReadinessBlock,
  type ReadinessProperty,
  type ReadinessUnit,
  type ReadinessUser,
} from "@/lib/legacy-readiness-report";

/** Read-only audit against the current database. Never writes. */
export async function auditLegacyReadiness(now = new Date()) {
  await connectToDatabase();

  const [properties, users, assignments, units, blocks, billingAccounts] = await Promise.all([
    Property.find({ deletedAt: null })
      .select("_id ownerId caretakerIds custodianIds deletedAt")
      .lean(),
    User.find({ isActive: true }).select("_id role isActive managedByOwnerId").lean(),
    ManagementAssignment.find({ status: "active" })
      .select("_id principalUserId accessRole scopeType propertyId blockId unitId")
      .lean(),
    Unit.find({ deletedAt: null })
      .select("_id propertyId blockId billingAccountId deletedAt")
      .lean(),
    Block.find({ deletedAt: null }).select("_id propertyId deletedAt").lean(),
    BillingAccount.find({ deletedAt: null }).select("_id status deletedAt").lean(),
  ]);

  return buildLegacyReadinessReport({
    now,
    properties: properties as unknown as ReadinessProperty[],
    users: users as unknown as ReadinessUser[],
    assignments: assignments as unknown as ReadinessAssignment[],
    units: units as unknown as ReadinessUnit[],
    blocks: blocks as unknown as ReadinessBlock[],
    billingAccounts: billingAccounts as unknown as ReadinessBillingAccount[],
  });
}
