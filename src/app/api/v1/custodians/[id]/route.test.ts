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

import { DELETE, PATCH } from "@/app/api/v1/custodians/[id]/route";
import { writeAuditEvent } from "@/lib/audit";

const { user, property, managementAssignment } = getModelStubs();

const OWNER_ID = makeObjectId("admin");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const PROP_ID = makeObjectId("prop");

function custodianDoc(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: CUSTODIAN_ID,
    name: "Custodian One",
    email: "custodian@keja.co",
    phone: "",
    role: "custodian",
    isActive: true,
    privileges: [],
    save: vi.fn<() => Promise<unknown>>(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function mockCustodianOwner(ownerId = OWNER_ID) {
  managementAssignment.find.mockReturnValue(
    buildQuery([
      {
        principalUserId: CUSTODIAN_ID,
        accessRole: "custodian",
        scopeType: "property",
        propertyId: PROP_ID,
        status: "active",
      },
    ]),
  );
  property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, ownerId }]));
}

function authOwner(id = OWNER_ID) {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: id, role: "admin" })));
  mockCustodianOwner();
}

describe("PATCH /api/v1/custodians/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
    vi.mocked(writeAuditEvent).mockClear();
  });

  it("404 when the custodian does not exist", async () => {
    authOwner();
    user.findOne.mockResolvedValue(null);
    const res = await PATCH(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { name: "Renamed" },
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 when the custodian is managed by another owner", async () => {
    authOwner();
    mockCustodianOwner(OTHER_OWNER_ID);
    user.findOne.mockResolvedValue(custodianDoc());
    const res = await PATCH(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { name: "Renamed" },
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a non-owner actor", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    const res = await PATCH(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "PATCH",
        token: signToken(CUSTODIAN_ID),
        body: { name: "Renamed" },
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a privileged custodian trying to edit a peer", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CUSTODIAN_ID,
          role: "custodian",
          privileges: ["assign_privileges"],
        }),
      ),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "PATCH",
        token: signToken(CUSTODIAN_ID),
        body: { privileges: [] },
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(403);
    expect(user.findOne).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/custodians/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("404 when the target is not a custodian (e.g. the owner)", async () => {
    authOwner();
    user.findOne.mockResolvedValue(null);

    const res = await DELETE(
      buildRequest(`/api/v1/custodians/${OWNER_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(OWNER_ID),
    );
    expect(res.status).toBe(404);
    expect(user.findOne).toHaveBeenCalledWith({ _id: OWNER_ID, role: "custodian" });
  });

  it("403 when a custodian tries to revoke a peer custodian", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CUSTODIAN_ID,
          role: "custodian",
          privileges: ["assign_privileges"],
        }),
      ),
    );

    const res = await DELETE(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "DELETE",
        token: signToken(CUSTODIAN_ID),
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(403);
    expect(user.findOne).not.toHaveBeenCalled();
  });

  it("403 when a custodian tries to deactivate the owner", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({
          _id: CUSTODIAN_ID,
          role: "custodian",
          privileges: ["assign_privileges"],
        }),
      ),
    );

    const res = await DELETE(
      buildRequest(`/api/v1/custodians/${OWNER_ID}`, {
        method: "DELETE",
        token: signToken(CUSTODIAN_ID),
      }),
      withParams(OWNER_ID),
    );
    expect(res.status).toBe(403);
    expect(user.findOne).not.toHaveBeenCalled();
  });

  it("403 when a caretaker tries to deactivate the owner", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "caretaker" })));

    const res = await DELETE(
      buildRequest(`/api/v1/custodians/${OWNER_ID}`, {
        method: "DELETE",
        token: signToken(CUSTODIAN_ID),
      }),
      withParams(OWNER_ID),
    );
    expect(res.status).toBe(403);
    expect(user.findOne).not.toHaveBeenCalled();
  });
});
