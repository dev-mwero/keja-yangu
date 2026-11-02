import { type PolicyAction, roleMaximumActions } from "@/lib/authorization";
import type { AssignmentAccessRole, AssignmentScopeType } from "@/lib/domain-enums";

export interface LegacyBackfillProperty {
  _id: string;
  ownerId?: string;
  custodianIds?: string[];
  caretakerIds?: string[];
}

export interface LegacyBackfillUser {
  _id: string;
  role: string;
  privileges?: string[];
  isActive?: boolean;
}

export interface BackfillAssignmentSpec {
  principalUserId: string;
  accessRole: AssignmentAccessRole;
  scopeType: AssignmentScopeType;
  propertyId: string;
  blockId: string;
  unitId: string;
  permissions: PolicyAction[];
  status: "active";
  startsAt: Date;
  endsAt: null;
  grantedByUserId: string;
  grantedAt: Date;
  reason: string;
  source: "migration";
  legacyOwnerId: string;
}

export interface BackfillWarning {
  code:
    | "missing-owner"
    | "invalid-principal"
    | "owner-user-missing"
    | "role-mismatch"
    | "inactive-user"
    | "unrepresentable-privilege"
    | "duplicate";
  principalUserId?: string;
  propertyId: string;
  privilege?: string;
}

export interface BackfillPlan {
  assignments: BackfillAssignmentSpec[];
  warnings: BackfillWarning[];
}

const CARETAKER_BASELINE_ACTIONS: PolicyAction[] = [
  "property:read",
  "unit:read",
  "assignment:read",
];

const CARETAKER_PRIVILEGE_ACTIONS: Record<string, PolicyAction[]> = {
  edit_property: ["property:edit"],
  manage_units: ["unit:manage"],
  manage_tenants: ["tenant:manage", "application:manage"],
  process_move_requests: ["move-request:create", "move-request:manage"],
  manage_invoices: ["invoice:read", "invoice:manage", "invoice:mark-paid", "invoice:generate"],
  manage_complaints: ["complaint:manage"],
  manage_announcements: ["announcement:read", "announcement:manage"],
  send_messages: ["chat:read-own", "chat:send", "chat:manage"],
  manage_documents: ["document:read-own", "document:manage"],
};

const UNREPRESENTABLE_CARETAKER_PRIVILEGES = new Set([
  "create_property",
  "delete_assigned_property",
]);

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export function caretakerMigrationActions(privileges: string[]): {
  actions: PolicyAction[];
  unrepresentable: string[];
} {
  const actions = [...CARETAKER_BASELINE_ACTIONS];
  const unrepresentable: string[] = [];

  for (const privilege of privileges) {
    if (UNREPRESENTABLE_CARETAKER_PRIVILEGES.has(privilege)) {
      unrepresentable.push(privilege);
      continue;
    }
    const mapped = CARETAKER_PRIVILEGE_ACTIONS[privilege];
    if (!mapped) {
      unrepresentable.push(privilege);
      continue;
    }
    actions.push(...mapped);
  }

  return { actions: [...new Set(actions)], unrepresentable };
}

function baseSpec(input: {
  principalUserId: string;
  accessRole: AssignmentAccessRole;
  propertyId: string;
  legacyOwnerId: string;
  permissions: PolicyAction[];
  now: Date;
}): BackfillAssignmentSpec {
  return {
    principalUserId: input.principalUserId,
    accessRole: input.accessRole,
    scopeType: "property",
    propertyId: input.propertyId,
    blockId: "",
    unitId: "",
    permissions: input.permissions,
    status: "active",
    startsAt: input.now,
    endsAt: null,
    grantedByUserId: "system",
    grantedAt: input.now,
    reason: "Legacy assignment backfill",
    source: "migration",
    legacyOwnerId: input.legacyOwnerId,
  };
}

export function planAssignmentBackfill(input: {
  properties: LegacyBackfillProperty[];
  users: LegacyBackfillUser[];
  now: Date;
}): BackfillPlan {
  const usersById = new Map(input.users.map((user) => [String(user._id), user]));
  const assignments: BackfillAssignmentSpec[] = [];
  const warnings: BackfillWarning[] = [];
  const seen = new Set<string>();

  const add = (spec: BackfillAssignmentSpec) => {
    const key = `${spec.principalUserId}:${spec.accessRole}:${spec.propertyId}`;
    if (seen.has(key)) {
      warnings.push({
        code: "duplicate",
        principalUserId: spec.principalUserId,
        propertyId: spec.propertyId,
      });
      return;
    }
    seen.add(key);
    assignments.push(spec);
  };

  for (const property of input.properties) {
    const propertyId = String(property._id);
    const legacyOwnerId = (property.ownerId ?? "").trim();

    if (!legacyOwnerId) {
      warnings.push({ code: "missing-owner", propertyId });
    } else if (!OBJECT_ID.test(legacyOwnerId)) {
      warnings.push({
        code: "invalid-principal",
        principalUserId: legacyOwnerId,
        propertyId,
      });
    } else {
      const owner = usersById.get(legacyOwnerId);
      if (!owner) {
        warnings.push({
          code: "owner-user-missing",
          principalUserId: legacyOwnerId,
          propertyId,
        });
      } else if (owner.isActive === false) {
        warnings.push({
          code: "inactive-user",
          principalUserId: legacyOwnerId,
          propertyId,
        });
      } else if (owner.role !== "owner" && owner.role !== "admin") {
        warnings.push({
          code: "role-mismatch",
          principalUserId: legacyOwnerId,
          propertyId,
        });
      }
      add(
        baseSpec({
          principalUserId: legacyOwnerId,
          accessRole: "admin",
          propertyId,
          legacyOwnerId,
          permissions: roleMaximumActions("admin"),
          now: input.now,
        }),
      );
    }

    for (const principalUserId of property.custodianIds ?? []) {
      const id = String(principalUserId);
      if (!OBJECT_ID.test(id)) {
        warnings.push({ code: "invalid-principal", principalUserId: id, propertyId });
        continue;
      }
      const user = usersById.get(id);
      if (!user) {
        warnings.push({ code: "role-mismatch", principalUserId: id, propertyId });
        continue;
      }
      if (user.isActive === false) {
        warnings.push({ code: "inactive-user", principalUserId: id, propertyId });
        continue;
      }
      if (user.role !== "custodian") {
        warnings.push({ code: "role-mismatch", principalUserId: id, propertyId });
        continue;
      }
      add(
        baseSpec({
          principalUserId: id,
          accessRole: "custodian",
          propertyId,
          legacyOwnerId,
          permissions: roleMaximumActions("custodian"),
          now: input.now,
        }),
      );
    }

    for (const principalUserId of property.caretakerIds ?? []) {
      const id = String(principalUserId);
      if (!OBJECT_ID.test(id)) {
        warnings.push({ code: "invalid-principal", principalUserId: id, propertyId });
        continue;
      }
      const user = usersById.get(id);
      if (!user) {
        warnings.push({ code: "role-mismatch", principalUserId: id, propertyId });
        continue;
      }
      if (user.isActive === false) {
        warnings.push({ code: "inactive-user", principalUserId: id, propertyId });
        continue;
      }
      if (user.role !== "caretaker") {
        warnings.push({ code: "role-mismatch", principalUserId: id, propertyId });
        continue;
      }

      const mapped = caretakerMigrationActions(user.privileges ?? []);
      for (const privilege of mapped.unrepresentable) {
        warnings.push({
          code: "unrepresentable-privilege",
          principalUserId: id,
          propertyId,
          privilege,
        });
      }
      add(
        baseSpec({
          principalUserId: id,
          accessRole: "caretaker",
          propertyId,
          legacyOwnerId,
          permissions: mapped.actions,
          now: input.now,
        }),
      );
    }
  }

  return { assignments, warnings };
}
