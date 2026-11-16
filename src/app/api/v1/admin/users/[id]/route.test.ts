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

import { PATCH } from "@/app/api/v1/admin/users/[id]/route";

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
    buildQuery(String(id) === String(SYS_ADMIN_ID) ? actor : target),
  );
}

function patch(id: string, body: Record<string, unknown>, token?: string) {
  return PATCH(
    buildRequest(`/api/v1/admin/users/${id}`, {
      method: "PATCH",
      token: token ?? signToken(SYS_ADMIN_ID),
      body,
    }),
    withParams(id),
  );
}

describe("PATCH /api/v1/admin/users/[id]", () => {
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
      buildRequest(`/api/v1/admin/users/${TARGET_ID}`, {
        method: "PATCH",
        body: { isActive: false },
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the feature flag is disabled", async () => {
    process.env.ROLE_MANAGEMENT_ENABLED = "false";
    const res = await patch(TARGET_ID, { isActive: false });
    expect(res.status).toBe(404);
  });

  it("403 for a non-system-admin actor", async () => {
    mockDocs(
      makeUser({ _id: SYS_ADMIN_ID, role: "admin" }) as unknown as Record<string, unknown>,
      targetDoc() as unknown as Record<string, unknown>,
    );
    const res = await patch(TARGET_ID, { isActive: false });
    expect(res.status).toBe(403);
  });

  it("401 when the token is stale (tokenVersion mismatch)", async () => {
    const res = await patch(
      TARGET_ID,
      { isActive: false },
      signToken(SYS_ADMIN_ID, { tokenVersion: 99 }),
    );
    expect(res.status).toBe(401);
  });

  it("400 when the body is invalid", async () => {
    const res = await patch(TARGET_ID, { isActive: "nope" });
    expect(res.status).toBe(400);
    expect(models.user.updateOne).not.toHaveBeenCalled();
  });

  it("404 when the target user does not exist", async () => {
    mockDocs(sysAdminDoc() as unknown as Record<string, unknown>, null);
    const res = await patch(TARGET_ID, { isActive: false });
    expect(res.status).toBe(404);
  });

  it("403 when the target is a system-admin (CLI-only management)", async () => {
    mockDocs(
      sysAdminDoc() as unknown as Record<string, unknown>,
      targetDoc({ role: "system-admin" }) as unknown as Record<string, unknown>,
    );
    const res = await patch(TARGET_ID, { isActive: false });
    expect(res.status).toBe(403);
    expect(models.user.updateOne).not.toHaveBeenCalled();
    expect(models.auditEvent.create).not.toHaveBeenCalled();
  });

  it("403 when the actor targets themselves", async () => {
    const res = await patch(SYS_ADMIN_ID, { isActive: false });
    expect(res.status).toBe(403);
    expect(models.user.updateOne).not.toHaveBeenCalled();
  });

  it("revokes assignments and bumps tokenVersion on deactivation", async () => {
    const res = await patch(TARGET_ID, { isActive: false, reason: "offboarding" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).toMatchObject({ id: TARGET_ID, isActive: false });

    expect(models.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(models.user.updateOne).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      { $set: { isActive: false, tokenVersion: 3 } },
    );
    expect(models.managementAssignment.updateMany).toHaveBeenCalledWith(
      { principalUserId: TARGET_ID, status: { $in: ["active", "pending", "suspended"] } },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "revoked",
          revokedByUserId: SYS_ADMIN_ID,
          reason: "offboarding",
        }),
      }),
    );
  });

  it("does not restore assignments or sessions on reactivation", async () => {
    mockDocs(
      sysAdminDoc() as unknown as Record<string, unknown>,
      targetDoc({ isActive: false, tokenVersion: 3 }) as unknown as Record<string, unknown>,
    );
    const res = await patch(TARGET_ID, { isActive: true });
    expect(res.status).toBe(200);
    expect(models.user.updateOne).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      { $set: { isActive: true } },
    );
    expect(models.managementAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("returns the user unchanged when the status already matches (idempotent)", async () => {
    const res = await patch(TARGET_ID, { isActive: true });
    expect(res.status).toBe(200);
    expect(models.user.updateOne).not.toHaveBeenCalled();
    expect(models.auditEvent.create).not.toHaveBeenCalled();
  });

  it("500 and no mutation when the audit write fails (fail closed)", async () => {
    models.auditEvent.create.mockRejectedValue(new Error("audit unavailable"));
    const res = await patch(TARGET_ID, { isActive: false });
    expect(res.status).toBe(500);
    expect(models.user.updateOne).not.toHaveBeenCalled();
    expect(models.managementAssignment.updateMany).not.toHaveBeenCalled();
  });
});
