/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/PropertyType", () => ({ PropertyTypeModel: getModelStubs().propertytype }));

import { PATCH } from "@/app/api/v1/property-types/[id]/route";

const { user, propertytype } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const OWNER_ID = makeObjectId("owner");
const TYPE_ID = makeObjectId("type");

function typeDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: TYPE_ID,
    key: "villa",
    label: "Villa",
    order: 1,
    active: true,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("PATCH /api/v1/property-types/:id", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
  });

  it("rejects an invalid id", async () => {
    const res = await PATCH(
      buildRequest("/api/v1/property-types/nope", {
        method: "PATCH",
        token: signToken(ADMIN_ID),
        body: { label: "Renamed" },
      }),
      withParams("nope"),
    );
    expect(res.status).toBe(400);
  });

  it("requires the system admin", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await PATCH(
      buildRequest(`/api/v1/property-types/${TYPE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { active: false },
      }),
      withParams(TYPE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the type does not exist", async () => {
    propertytype.findOne.mockResolvedValue(null);
    const res = await PATCH(
      buildRequest(`/api/v1/property-types/${TYPE_ID}`, {
        method: "PATCH",
        token: signToken(ADMIN_ID),
        body: { label: "Renamed" },
      }),
      withParams(TYPE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("renames and deactivates a type", async () => {
    const doc = typeDoc();
    propertytype.findOne.mockResolvedValue(doc);

    const res = await PATCH(
      buildRequest(`/api/v1/property-types/${TYPE_ID}`, {
        method: "PATCH",
        token: signToken(ADMIN_ID),
        body: { label: "Townhouse", active: false },
      }),
      withParams(TYPE_ID),
    );

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toMatchObject({ label: "Townhouse", active: false });
    expect(doc.save).toHaveBeenCalled();
  });
});
