/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({
  writeAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { PUT } from "@/app/api/v1/caretakers/[id]/privileges/route";
import { writeAuditEvent } from "@/lib/audit";

const { user, property, managementAssignment } = getModelStubs();
const PROP_ID = makeObjectId("prop");

const OWNER_ID = makeObjectId("admin");

const ADMIN_ID = makeObjectId("admin");
const CARE_ID = makeObjectId("care");
const TARGET_ID = makeObjectId("target");
const TENANT_ID = makeObjectId("tenant");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "admin" });
}

function adminDoc() {
  return makeUser({ _id: ADMIN_ID, role: "system-admin" });
}

function caretakerDoc(id: string, overrides: Partial<ReturnType<typeof makeUser>> = {}) {
  return makeUser({
    _id: id,
    role: "caretaker",
    name: "Test Caretaker",
    email: "care@keja.co",
    privileges: [],
    ...overrides,
  });
}

/**
 * The route looks the actor up first (from the token) and the target second
 * (from the path param). Stub both in one expression.
 */
function mockActorAndTarget(
  actor: ReturnType<typeof makeUser>,
  target: ReturnType<typeof makeUser>,
) {
  user.findById.mockReturnValueOnce(buildQuery(actor)).mockReturnValueOnce(buildQuery(target));
}

function putRequest(
  token: string,
  id = TARGET_ID,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return buildRequest(`/api/v1/caretakers/${id}/privileges`, {
    method: "PUT",
    token,
    headers,
    body: body as Record<string, unknown>,
  });
}

describe("PUT /api/v1/caretakers/[id]/privileges", () => {
  beforeEach(() => {
    resetModelStubs();
    vi.mocked(writeAuditEvent).mockClear();
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    user.findOneAndUpdate.mockReturnValue(buildQuery(caretakerDoc(TARGET_ID)));
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await PUT(
        putRequest(
          signToken(OWNER_ID),
          TARGET_ID,
          { privileges: ["manage_tenants"] },
          { "x-forwarded-for": "203.0.113.9" },
        ),
        withParams(TARGET_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("403 when the Origin header does not match the app origin", async () => {
    const res = await PUT(
      putRequest(
        signToken(OWNER_ID),
        TARGET_ID,
        { privileges: ["manage_tenants"] },
        { origin: "https://evil.example" },
      ),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid caretaker id", async () => {
    const res = await PUT(
      putRequest(signToken(OWNER_ID), INVALID_ID, { privileges: [] }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const res = await PUT(putRequest("", TARGET_ID, { privileges: [] }), withParams(TARGET_ID));
    expect(res.status).toBe(401);
  });

  it("401 for an inactive actor", async () => {
    user.findById.mockReturnValue(buildQuery({ ...ownerDoc(), isActive: false }));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: [] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a caretaker actor", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(CARE_ID, {})));
    const res = await PUT(
      putRequest(signToken(CARE_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a tenant actor", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    const res = await PUT(
      putRequest(signToken(TENANT_ID), TARGET_ID, { privileges: [] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid privilege value", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: ["super_admin"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(400);
  });

  it("400 when the target is not a caretaker", async () => {
    mockActorAndTarget(ownerDoc(), makeUser({ _id: TARGET_ID, role: "admin" }));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: [] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(400);
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("system-admin sets privileges without binding the caretaker", async () => {
    mockActorAndTarget(adminDoc(), caretakerDoc(TARGET_ID, {}));
    user.findOneAndUpdate.mockReturnValue(
      buildQuery(
        caretakerDoc(TARGET_ID, {
          privileges: ["manage_tenants"],
        }),
      ),
    );
    const res = await PUT(
      putRequest(signToken(ADMIN_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    const updateData = user.findOneAndUpdate.mock.calls[0][1] as {
      managedByOwnerId?: string;
      privileges?: string[];
    };
    expect(updateData.privileges).toEqual(["manage_tenants"]);
    expect(updateData.managedByOwnerId).toBeUndefined();
  });

  it("lets a privileged custodian update a caretaker under their owner", async () => {
    const custodian = makeUser({
      _id: CARE_ID,
      role: "custodian",
      privileges: ["assign_privileges"],
    });
    mockActorAndTarget(custodian, caretakerDoc(TARGET_ID));
    managementAssignment.find.mockReturnValue(
      buildQuery([
        {
          principalUserId: CARE_ID,
          accessRole: "custodian",
          scopeType: "property",
          propertyId: PROP_ID,
          status: "active",
        },
      ]),
    );
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, ownerId: OWNER_ID }]));
    user.findOneAndUpdate.mockReturnValue(
      buildQuery(
        caretakerDoc(TARGET_ID, {
          privileges: ["manage_tenants"],
        }),
      ),
    );

    const res = await PUT(
      putRequest(signToken(CARE_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    expect(user.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      { privileges: ["manage_tenants"] },
      { new: true, runValidators: true },
    );
  });

  it("403 for a non-privileged custodian", async () => {
    const custodian = makeUser({
      _id: CARE_ID,
      role: "custodian",
      privileges: [],
    });
    user.findById.mockReturnValue(buildQuery(custodian));

    const res = await PUT(
      putRequest(signToken(CARE_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("403 when a privileged custodian targets another owner's caretaker", async () => {
    const custodian = makeUser({
      _id: CARE_ID,
      role: "custodian",
      privileges: ["assign_privileges"],
    });
    mockActorAndTarget(custodian, caretakerDoc(TARGET_ID, {}));

    const res = await PUT(
      putRequest(signToken(CARE_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(403);
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
