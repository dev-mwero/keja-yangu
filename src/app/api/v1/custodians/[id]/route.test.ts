/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { DELETE, PATCH } from "@/app/api/v1/custodians/[id]/route";

const { user } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const CUSTODIAN_ID = makeObjectId("custodian");

function custodianDoc(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: CUSTODIAN_ID,
    name: "Custodian One",
    email: "custodian@keja.co",
    phone: "",
    role: "custodian",
    managedByOwnerId: OWNER_ID,
    isActive: true,
    save: vi.fn<() => Promise<unknown>>(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  return doc;
}

function authOwner(id = OWNER_ID) {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: id, role: "owner" })));
}

describe("PATCH /api/v1/custodians/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
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
    user.findOne.mockResolvedValue(custodianDoc({ managedByOwnerId: OTHER_OWNER_ID }));
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
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
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

  it("owner updates the custodian profile", async () => {
    authOwner();
    const doc = custodianDoc();
    user.findOne.mockResolvedValue(doc);

    const res = await PATCH(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { name: "Renamed", phone: "+254700000000" },
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(200);
    expect(doc.name).toBe("Renamed");
    expect(doc.phone).toBe("+254700000000");
    expect(doc.save).toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/custodians/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("owner revokes a custodian (unlinks and deactivates)", async () => {
    authOwner();
    const doc = custodianDoc();
    user.findOne.mockResolvedValue(doc);

    const res = await DELETE(
      buildRequest(`/api/v1/custodians/${CUSTODIAN_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(CUSTODIAN_ID),
    );
    expect(res.status).toBe(200);
    expect(doc.managedByOwnerId).toBe("");
    expect(doc.isActive).toBe(false);
    expect(doc.save).toHaveBeenCalled();
  });
});
