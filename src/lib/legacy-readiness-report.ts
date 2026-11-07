/**
 * Pure legacy-readiness report builder (no mongoose/model imports).
 *
 * Split out of `legacy-readiness.ts` so scripts running under tsx's ESM
 * loader can use it: Node's CJS lexer cannot statically detect mongoose's
 * `models` export, so importing any module that (transitively) imports the
 * app models fails at instantiation with
 * `The requested module 'mongoose' does not provide an export named 'models'`.
 */

export interface ReadinessProperty {
  _id: unknown;
  ownerId?: string;
  caretakerIds?: string[];
  custodianIds?: string[];
  deletedAt?: Date | null;
}

export interface ReadinessUser {
  _id: unknown;
  role: string;
  isActive?: boolean;
  managedByOwnerId?: string;
}

export interface ReadinessAssignment {
  _id: unknown;
  principalUserId: string;
  accessRole: string;
  scopeType: string;
  propertyId: string;
  blockId?: string;
  unitId?: string;
}

export interface ReadinessUnit {
  _id: unknown;
  propertyId: string;
  blockId?: string;
  billingAccountId?: string;
  deletedAt?: Date | null;
}

export interface ReadinessBlock {
  _id: unknown;
  propertyId: string;
  deletedAt?: Date | null;
}

export interface ReadinessBillingAccount {
  _id: unknown;
  status?: string;
  deletedAt?: Date | null;
}

export interface LegacyReadinessInput {
  now?: Date;
  properties: ReadinessProperty[];
  users: ReadinessUser[];
  assignments: ReadinessAssignment[];
  units: ReadinessUnit[];
  blocks: ReadinessBlock[];
  billingAccounts: ReadinessBillingAccount[];
}

export interface LegacyReadinessReport {
  generatedAt: string;
  counts: {
    activeOwnerRoleUsers: number;
    propertiesWithLegacyOwner: number;
    propertiesWithLegacyCaretakers: number;
    propertiesWithLegacyCustodians: number;
    usersWithLegacyManager: number;
    activeAssignments: number;
  };
  blocking: {
    ownerRoleUsers: string[];
    ownersWithoutAssignment: Array<{ propertyId: string; ownerId: string }>;
    orphanAssignments: Array<{ assignmentId: string; propertyId: string }>;
    missingBlockAssignments: Array<{ assignmentId: string; blockId: string }>;
    missingUnitAssignments: Array<{ assignmentId: string; unitId: string }>;
    unitBillingDrift: Array<{ unitId: string; billingAccountId: string }>;
  };
  readyForLegacyRetirement: boolean;
}

function hasLegacyValues(values?: string[]): boolean {
  return (values ?? []).some((value) => String(value ?? "").trim() !== "");
}

/**
 * Pure readiness report builder. `readyForLegacyRetirement` only turns true once
 * every legacy reference is gone and no assignment/billing drift remains.
 */
export function buildLegacyReadinessReport(input: LegacyReadinessInput): LegacyReadinessReport {
  const properties = input.properties.filter((property) => !property.deletedAt);
  const units = input.units.filter((unit) => !unit.deletedAt);
  const blocks = input.blocks.filter((block) => !block.deletedAt);
  const billingAccounts = input.billingAccounts.filter((account) => !account.deletedAt);

  const propertyIds = new Set(properties.map((property) => String(property._id)));
  const blockById = new Map(blocks.map((block) => [String(block._id), block]));
  const unitById = new Map(units.map((unit) => [String(unit._id), unit]));
  const activeBillingAccountIds = new Set(
    billingAccounts
      .filter((account) => account.status === "active")
      .map((account) => String(account._id)),
  );

  const activeAdminAssignments = new Set(
    input.assignments
      .filter((assignment) => assignment.accessRole === "admin")
      .map((assignment) => `${assignment.principalUserId}:${assignment.propertyId}`),
  );
  const ownerRoleUsers = input.users
    .filter((user) => user.isActive !== false && user.role === "owner")
    .map((user) => String(user._id));

  let propertiesWithLegacyOwner = 0;
  let propertiesWithLegacyCaretakers = 0;
  let propertiesWithLegacyCustodians = 0;
  const ownersWithoutAssignment: Array<{ propertyId: string; ownerId: string }> = [];

  for (const property of properties) {
    const propertyId = String(property._id);
    const ownerId = String(property.ownerId ?? "").trim();

    if (ownerId) {
      propertiesWithLegacyOwner += 1;
      if (!activeAdminAssignments.has(`${ownerId}:${propertyId}`)) {
        ownersWithoutAssignment.push({ propertyId, ownerId });
      }
    }
    if (hasLegacyValues(property.caretakerIds)) propertiesWithLegacyCaretakers += 1;
    if (hasLegacyValues(property.custodianIds)) propertiesWithLegacyCustodians += 1;
  }

  const usersWithLegacyManager = input.users.filter(
    (user) => user.isActive !== false && String(user.managedByOwnerId ?? "").trim() !== "",
  ).length;

  const orphanAssignments: Array<{ assignmentId: string; propertyId: string }> = [];
  const missingBlockAssignments: Array<{ assignmentId: string; blockId: string }> = [];
  const missingUnitAssignments: Array<{ assignmentId: string; unitId: string }> = [];

  for (const assignment of input.assignments) {
    const assignmentId = String(assignment._id);
    const propertyId = String(assignment.propertyId ?? "");

    if (!propertyIds.has(propertyId)) {
      orphanAssignments.push({ assignmentId, propertyId });
      continue;
    }

    if (assignment.scopeType === "block") {
      const blockId = String(assignment.blockId ?? "");
      const block = blockById.get(blockId);
      if (!block || String(block.propertyId) !== propertyId) {
        missingBlockAssignments.push({ assignmentId, blockId });
      }
    }

    if (assignment.scopeType === "unit") {
      const unitId = String(assignment.unitId ?? "");
      const unit = unitById.get(unitId);
      if (!unit || String(unit.propertyId) !== propertyId) {
        missingUnitAssignments.push({ assignmentId, unitId });
      }
    }
  }

  const unitBillingDrift: Array<{ unitId: string; billingAccountId: string }> = [];
  for (const unit of units) {
    const billingAccountId = String(unit.billingAccountId ?? "").trim();
    if (!billingAccountId) continue;
    if (!activeBillingAccountIds.has(billingAccountId)) {
      unitBillingDrift.push({ unitId: String(unit._id), billingAccountId });
    }
  }

  // Property.ownerId is retained as data attribution (ownership of record) and
  // is no longer an authorization signal. The legacy *authorization* fields
  // (managedByOwnerId, caretakerIds, custodianIds) are likewise metadata: the
  // only authorization source is ManagementAssignment. Retirement is therefore
  // gated on the absence of legacy *roles* and assignment/billing drift, not on
  // the presence of those attribution/metadata fields.
  const readyForLegacyRetirement =
    ownerRoleUsers.length === 0 &&
    ownersWithoutAssignment.length === 0 &&
    orphanAssignments.length === 0 &&
    missingBlockAssignments.length === 0 &&
    missingUnitAssignments.length === 0 &&
    unitBillingDrift.length === 0;

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    counts: {
      activeOwnerRoleUsers: ownerRoleUsers.length,
      propertiesWithLegacyOwner,
      propertiesWithLegacyCaretakers,
      propertiesWithLegacyCustodians,
      usersWithLegacyManager,
      activeAssignments: input.assignments.length,
    },
    blocking: {
      ownerRoleUsers,
      ownersWithoutAssignment,
      orphanAssignments,
      missingBlockAssignments,
      missingUnitAssignments,
      unitBillingDrift,
    },
    readyForLegacyRetirement,
  };
}
