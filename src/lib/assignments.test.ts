/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/models/AuditEvent", () => ({ AuditEvent: getModelStubs().auditEvent }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import {
  AssignmentError,
  acceptAssignment,
  grantAssignment,
  revokeAssignment,
} from "@/lib/assignments";
import type { AssignmentLike } from "@/lib/authorization";

const models = getModelStubs();
const ACTOR_ID = makeObjectId("actor");
const PRINCIPAL_ID = makeObjectId("principal");
const PROPERTY_ID = makeObjectId("property");
const OTHER_PROPERTY_ID = makeObjectId("other-property");
const ASSIGNMENT_ID = makeObjectId("assignment");
const NOW = new Date("2026-11-02T00:00:00.000Z");

function userDoc(role: string, isActive = true) {
  return { _id: role === "system-admin" ? ACTOR_ID : PRINCIPAL_ID, role, isActive };
}

function assignment(overrides: Partial<AssignmentLike> = {}): AssignmentLike {
  return {
    principalUserId: ACTOR_ID,
    accessRole: "admin",
    scopeType: "property",
    propertyId: PROPERTY_ID,
    blockId: "",
    unitId: "",
    permissions: ["assignment:grant", "assignment:revoke", "unit:read", "unit:manage"],
    status: "active",
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: null,
    ...overrides,
  };
}

function grantInput(overrides: Record<string, unknown> = {}) {
  return {
    principalUserId: PRINCIPAL_ID,
    accessRole: "admin" as const,
    scopeType: "property" as const,
    propertyId: PROPERTY_ID,
    permissions: ["unit:read", "unit:manage"] as never[],
    startsAt: NOW,
    ...overrides,
  };
}

function mockUsers(actorRole = "admin", principalRole = "admin", isActive = true) {
  models.user.findById.mockImplementation((id: unknown) =>
    buildQuery({
      _id: String(id),
      role: String(id) === String(ACTOR_ID) ? actorRole : principalRole,
      isActive,
    }),
  );
}

function mockSystemAdmin(isActive = true) {
  mockUsers("system-admin", "admin", isActive);
}

function mockActiveAdminActor() {
  mockUsers("admin", "admin");
  models.managementAssignment.find.mockReturnValue(buildQuery([assignment()]));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  resetModelStubs();
  models.property.findById.mockReturnValue(
    buildQuery({ _id: PROPERTY_ID, lifecycleState: "active" }),
  );
  models.auditEvent.create.mockResolvedValue({});
  models.managementAssignment.find.mockReturnValue(buildQuery([]));
  models.managementAssignment.findOne.mockReturnValue(buildQuery(null));
  models.managementAssignment.findById.mockReturnValue(buildQuery(null));
  models.property.findOne.mockReturnValue(buildQuery(null));
  mockUsers();
});

describe("grantAssignment", () => {
  it("lets a system-admin create a pending assignment and audits it", async () => {
    mockSystemAdmin();
    models.managementAssignment.create.mockResolvedValue({
      _id: ASSIGNMENT_ID,
      grantedAt: NOW,
    });

    await expect(grantAssignment(ACTOR_ID, grantInput())).resolves.toEqual({
      assignmentId: String(ASSIGNMENT_ID),
    });

    expect(models.managementAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        principalUserId: PRINCIPAL_ID,
        accessRole: "admin",
        scopeType: "property",
        propertyId: PROPERTY_ID,
        status: "pending",
        source: "invitation",
        grantedByUserId: ACTOR_ID,
      }),
    );
    expect(models.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "assignment.grant",
        actorUserId: ACTOR_ID,
        entityId: String(ASSIGNMENT_ID),
      }),
    );
  });

  it("rejects a permission above the target role maximum", async () => {
    mockSystemAdmin();
    await expect(
      grantAssignment(
        ACTOR_ID,
        grantInput({ accessRole: "caretaker", permissions: ["ownership:manage"] }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(models.managementAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects an actor who cannot grant on the scope", async () => {
    models.user.findById.mockReturnValue(buildQuery({ ...userDoc("admin"), _id: ACTOR_ID }));
    models.managementAssignment.find.mockReturnValue(
      buildQuery([assignment({ permissions: ["unit:read"] })]),
    );
    await expect(grantAssignment(ACTOR_ID, grantInput())).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects granting a permission the actor does not hold", async () => {
    mockActiveAdminActor();
    await expect(
      grantAssignment(ACTOR_ID, grantInput({ permissions: ["tenant:manage"] })),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a target user whose role does not match", async () => {
    mockUsers("system-admin", "caretaker");

    await expect(grantAssignment(ACTOR_ID, grantInput())).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("rejects duplicate pending or active assignments", async () => {
    mockSystemAdmin();
    models.managementAssignment.findOne.mockReturnValue(buildQuery({ _id: ASSIGNMENT_ID }));
    await expect(grantAssignment(ACTOR_ID, grantInput())).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("rejects a scope whose parent chain does not match", async () => {
    mockSystemAdmin();
    await expect(
      grantAssignment(
        ACTOR_ID,
        grantInput({
          scopeType: "block",
          propertyId: OTHER_PROPERTY_ID,
          blockId: makeObjectId("block"),
        }),
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rejects an invalid time window", async () => {
    mockSystemAdmin();
    await expect(
      grantAssignment(ACTOR_ID, grantInput({ endsAt: new Date("2026-01-01T00:00:00.000Z") })),
    ).rejects.toMatchObject({ code: "invalid" });
  });

  it("removes the assignment when the audit write fails", async () => {
    mockSystemAdmin();
    models.managementAssignment.create.mockResolvedValue({
      _id: ASSIGNMENT_ID,
      grantedAt: NOW,
    });
    models.auditEvent.create.mockRejectedValue(new Error("audit down"));

    await expect(grantAssignment(ACTOR_ID, grantInput())).rejects.toThrow("audit down");
    expect(models.managementAssignment.deleteOne).toHaveBeenCalledWith({ _id: ASSIGNMENT_ID });
  });

  it("rejects an inactive actor", async () => {
    mockSystemAdmin(false);
    await expect(grantAssignment(ACTOR_ID, grantInput())).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("acceptAssignment", () => {
  const pending = {
    _id: ASSIGNMENT_ID,
    principalUserId: PRINCIPAL_ID,
    accessRole: "admin",
    scopeType: "property",
    propertyId: PROPERTY_ID,
    blockId: "",
    unitId: "",
    permissions: ["unit:read"],
    status: "pending",
    startsAt: NOW,
    endsAt: null,
  } as const;

  it("activates a pending assignment for its principal and audits it", async () => {
    models.managementAssignment.findOne.mockReturnValue(buildQuery(pending));
    models.managementAssignment.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...pending, status: "active" }),
    );

    await expect(acceptAssignment(PRINCIPAL_ID, String(ASSIGNMENT_ID))).resolves.toEqual({
      assignmentId: String(ASSIGNMENT_ID),
    });
    expect(models.managementAssignment.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: String(ASSIGNMENT_ID), principalUserId: PRINCIPAL_ID, status: "pending" },
      { $set: { status: "active", acceptedAt: NOW } },
      { new: true },
    );
    expect(models.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assignment.accept" }),
    );
  });

  it("rejects acceptance by someone other than the principal", async () => {
    models.managementAssignment.findOne.mockReturnValue(buildQuery(null));
    await expect(acceptAssignment(PRINCIPAL_ID, String(ASSIGNMENT_ID))).rejects.toMatchObject({
      code: "not-found",
    });
  });

  it("rejects accepting a non-pending assignment", async () => {
    models.managementAssignment.findOne.mockReturnValue(
      buildQuery({ ...pending, status: "active" }),
    );
    await expect(acceptAssignment(PRINCIPAL_ID, String(ASSIGNMENT_ID))).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("rejects an expired invitation", async () => {
    models.managementAssignment.findOne.mockReturnValue(
      buildQuery({ ...pending, endsAt: new Date("2026-01-01T00:00:00.000Z") }),
    );
    await expect(acceptAssignment(PRINCIPAL_ID, String(ASSIGNMENT_ID))).rejects.toMatchObject({
      code: "conflict",
    });
  });
});

describe("revokeAssignment", () => {
  const active = {
    _id: ASSIGNMENT_ID,
    principalUserId: PRINCIPAL_ID,
    accessRole: "admin",
    scopeType: "property",
    propertyId: PROPERTY_ID,
    blockId: "",
    unitId: "",
    permissions: ["unit:read"],
    status: "active",
    startsAt: NOW,
    endsAt: null,
    reason: "",
  } as const;

  it("revokes an assignment in the actor's scope", async () => {
    mockActiveAdminActor();
    models.managementAssignment.findById.mockReturnValue(buildQuery(active));
    models.managementAssignment.updateOne.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      revokeAssignment(ACTOR_ID, String(ASSIGNMENT_ID), "Left the portfolio"),
    ).resolves.toEqual({ assignmentId: String(ASSIGNMENT_ID) });

    expect(models.managementAssignment.updateOne).toHaveBeenCalledWith(
      { _id: String(ASSIGNMENT_ID) },
      {
        $set: {
          status: "revoked",
          revokedByUserId: ACTOR_ID,
          revokedAt: NOW,
          reason: "Left the portfolio",
        },
      },
    );
    expect(models.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assignment.revoke" }),
    );
  });

  it("requires a reason", async () => {
    models.managementAssignment.findById.mockReturnValue(buildQuery(active));
    await expect(revokeAssignment(ACTOR_ID, String(ASSIGNMENT_ID), "  ")).rejects.toMatchObject({
      code: "invalid",
    });
  });

  it("rejects an actor without revoke authority on the scope", async () => {
    models.user.findById.mockReturnValue(buildQuery({ ...userDoc("admin"), _id: ACTOR_ID }));
    models.managementAssignment.find.mockReturnValue(
      buildQuery([assignment({ permissions: ["unit:read"] })]),
    );
    models.managementAssignment.findById.mockReturnValue(buildQuery(active));

    await expect(revokeAssignment(ACTOR_ID, String(ASSIGNMENT_ID), "Left")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects revoking an already revoked assignment", async () => {
    models.user.findById.mockReturnValue(buildQuery({ ...userDoc("admin"), _id: ACTOR_ID }));
    models.managementAssignment.findById.mockReturnValue(
      buildQuery({ ...active, status: "revoked" }),
    );
    await expect(revokeAssignment(ACTOR_ID, String(ASSIGNMENT_ID), "Left")).rejects.toBeInstanceOf(
      AssignmentError,
    );
  });
});
