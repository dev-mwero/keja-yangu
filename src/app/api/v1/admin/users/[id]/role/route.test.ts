/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/AuditEvent", () => ({ AuditEvent: getModelStubs().auditEvent }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/BrokerProfile", () => ({
  BrokerProfile: getModelStubs().brokerProfile,
}));

import { PATCH } from "@/app/api/v1/admin/users/[id]/role/route";

const models = getModelStubs();
const SYS_ADMIN_ID = makeObjectId("sysadmin");
const TARGET_ID = makeObjectId("target");

function sysAdminDoc() {
  return makeUser({ _id: SYS_ADMIN_ID, role: "system-admin" });
}

function targetDoc(overrides: Record<string, unknown> = {}) {
  return makeUser({
    _id: TARGET_ID,
    name: "Target User",
    email: "target@keja.co",
    role: "tenant",
    isActive: true,
    tokenVersion: 2,
    ...overrides,
  });
}

function mockDocs(actor: Record<string, unknown>, target: Record<string, unknown> | null) {
  models.user.findById.mockImplementation((id: unknown) =>
    buildQuery(String(id) === String(ACTOR_ID) ? actor : target),
  );
}

const ACTOR_ID = SYS_ADMIN_ID;

describe("PATCH /api/v1/admin/users/[id]/role", () => {
  beforeEach(() => {
    resetModelStubs();
    process.env.ROLE_MANAGEMENT_ENABLED = "true";
    mockDocs(
      sysAdminDoc() as unknown as Record<string, unknown>,
      targetDoc() as unknown as Record<string, unknown>,
    );
    models.auditEvent.create.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.ROLE_MANAGEMENT_ENABLED;
  });

  it("401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the feature flag is disabled", async () => {
    process.env.ROLE_MANAGEMENT_ENABLED = "false";
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 for a non-system-admin actor", async () => {
    mockDocs(
      makeUser({ _id: SYS_ADMIN_ID, role: "owner" }) as unknown as Record<string, unknown>,
      targetDoc() as unknown as Record<string, unknown>,
    );
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
  });

  it("401 when the token is stale (tokenVersion mismatch)", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID, { tokenVersion: 99 }),
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(401);
  });

  it("400 when the target role is system-admin (not assignable over HTTP)", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "system-admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(400);
    expect(models.user.updateOne).not.toHaveBeenCalled();
  });

  it("400 when the body is invalid", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "superuser" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when the target user does not exist", async () => {
    mockDocs(sysAdminDoc() as unknown as Record<string, unknown>, null);
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 when the target is a system-admin (CLI-only management)", async () => {
    mockDocs(
      sysAdminDoc() as unknown as Record<string, unknown>,
      targetDoc({ role: "system-admin" }) as unknown as Record<string, unknown>,
    );
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
    expect(models.user.updateOne).not.toHaveBeenCalled();
  });

  it("403 when the actor targets themselves", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${SYS_ADMIN_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "admin" },
      }),
      withParams(SYS_ADMIN_ID),
    );
    expect(res.status).toBe(403);
    expect(models.user.updateOne).not.toHaveBeenCalled();
  });

  it("allows assigning a staff role without an owner binding", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "caretaker" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    expect(models.user.updateOne).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      { $set: { role: "caretaker", privileges: [], tokenVersion: 3 } },
    );
  });

  it("returns the user unchanged when the role is already set (idempotent)", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "tenant" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    expect(models.user.updateOne).not.toHaveBeenCalled();
    expect(models.auditEvent.create).not.toHaveBeenCalled();
  });

  it("500 and no mutation when the audit write fails (fail closed)", async () => {
    models.auditEvent.create.mockRejectedValue(new Error("audit unavailable"));
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "admin" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(500);
    expect(models.user.updateOne).not.toHaveBeenCalled();
  });

  it("changes the role with cascading cleanup and audit", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "broker", reason: "annual review" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ id: TARGET_ID, role: "tenant" });

    expect(models.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(models.user.updateOne).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      { $set: { role: "broker", privileges: [], tokenVersion: 3 } },
    );
    expect(models.managementAssignment.updateMany).toHaveBeenCalledWith(
      { principalUserId: TARGET_ID, status: { $in: ["active", "pending", "suspended"] } },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "revoked" }),
      }),
    );
  });

  it("suspends the broker profile when exiting the broker role", async () => {
    mockDocs(
      sysAdminDoc() as unknown as Record<string, unknown>,
      targetDoc({ role: "broker" }) as unknown as Record<string, unknown>,
    );
    const res = await PATCH(
      buildRequest(`/api/v1/admin/users/${TARGET_ID}/role`, {
        method: "PATCH",
        token: signToken(SYS_ADMIN_ID),
        body: { role: "tenant" },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    expect(models.brokerProfile.updateOne).toHaveBeenCalledWith(
      { userId: TARGET_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "suspended" }),
      }),
    );
  });
});
