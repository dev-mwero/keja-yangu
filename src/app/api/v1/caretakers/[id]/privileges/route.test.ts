/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { PUT } from "@/app/api/v1/caretakers/[id]/privileges/route";

const { user } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const ADMIN_ID = makeObjectId("admin");
const CARE_ID = makeObjectId("care");
const TARGET_ID = makeObjectId("target");
const TENANT_ID = makeObjectId("tenant");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
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
    managedByOwnerId: "",
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

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("PUT /api/v1/caretakers/[id]/privileges", () => {
  beforeEach(() => {
    resetModelStubs();
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
    user.findById.mockReturnValue(
      buildQuery(caretakerDoc(CARE_ID, { managedByOwnerId: OWNER_ID })),
    );
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
    mockActorAndTarget(ownerDoc(), makeUser({ _id: TARGET_ID, role: "owner" }));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: [] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(400);
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("owner grants privileges and binds an unbound caretaker", async () => {
    mockActorAndTarget(ownerDoc(), caretakerDoc(TARGET_ID));
    const updated = caretakerDoc(TARGET_ID, {
      managedByOwnerId: OWNER_ID,
      privileges: ["manage_tenants", "manage_invoices"],
    });
    user.findOneAndUpdate.mockReturnValue(buildQuery(updated));

    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, {
        privileges: ["manage_tenants", "manage_invoices"],
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    expect(user.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: TARGET_ID },
      { privileges: ["manage_tenants", "manage_invoices"], managedByOwnerId: OWNER_ID },
      { new: true, runValidators: true },
    );
    const data = (await json(res)).data as { managedByOwnerId?: string; privileges?: string[] };
    expect(data.managedByOwnerId).toBe(OWNER_ID);
    expect(data.privileges).toEqual(["manage_tenants", "manage_invoices"]);
  });

  it("409 when the caretaker is bound to another owner", async () => {
    mockActorAndTarget(ownerDoc(), caretakerDoc(TARGET_ID, { managedByOwnerId: OTHER_OWNER_ID }));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(409);
    expect(user.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("duplicate privileges are deduped", async () => {
    mockActorAndTarget(ownerDoc(), caretakerDoc(TARGET_ID));
    user.findOneAndUpdate.mockReturnValue(
      buildQuery(caretakerDoc(TARGET_ID, { privileges: ["manage_tenants"] })),
    );
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, {
        privileges: ["manage_tenants", "manage_tenants"],
      }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    const updateData = user.findOneAndUpdate.mock.calls[0][1] as { privileges?: string[] };
    expect(updateData.privileges).toEqual(["manage_tenants"]);
  });

  it("owner can revoke all privileges", async () => {
    mockActorAndTarget(ownerDoc(), caretakerDoc(TARGET_ID));
    user.findOneAndUpdate.mockReturnValue(buildQuery(caretakerDoc(TARGET_ID, { privileges: [] })));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: [] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(200);
    const updateData = user.findOneAndUpdate.mock.calls[0][1] as { privileges?: string[] };
    expect(updateData.privileges).toEqual([]);
  });

  it("system-admin sets privileges without binding the caretaker", async () => {
    mockActorAndTarget(adminDoc(), caretakerDoc(TARGET_ID, { managedByOwnerId: OTHER_OWNER_ID }));
    user.findOneAndUpdate.mockReturnValue(
      buildQuery(
        caretakerDoc(TARGET_ID, {
          managedByOwnerId: OTHER_OWNER_ID,
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

  it("404 when the caretaker disappears between lookup and update", async () => {
    mockActorAndTarget(ownerDoc(), caretakerDoc(TARGET_ID));
    user.findOneAndUpdate.mockReturnValue(buildQuery(null));
    const res = await PUT(
      putRequest(signToken(OWNER_ID), TARGET_ID, { privileges: ["manage_tenants"] }),
      withParams(TARGET_ID),
    );
    expect(res.status).toBe(404);
  });
});
