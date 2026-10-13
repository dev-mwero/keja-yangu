/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));

import { GET } from "@/app/api/v1/users/search/route";

const { user } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const ADMIN_ID = makeObjectId("admin");
const CARE_ID = makeObjectId("care");
const TENANT_USER_ID = makeObjectId("tenant-user");

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc(privileges: string[]) {
  return makeUser({
    _id: CARE_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as ReturnType<typeof makeUser>["privileges"],
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/users/search", () => {
  beforeEach(() => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/users/search?email=a@b.co"));
    expect(res.status).toBe(401);
  });

  it("400 when neither email nor phone is provided", async () => {
    const res = await GET(buildRequest("/api/v1/users/search", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(400);
  });

  it("403 for a tenant user", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_USER_ID, role: "tenant" })));
    const res = await GET(
      buildRequest("/api/v1/users/search?email=a@b.co", {
        token: signToken(TENANT_USER_ID),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403 for a caretaker without manage_tenants", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc([])));
    const res = await GET(
      buildRequest("/api/v1/users/search?email=a@b.co", { token: signToken(CARE_ID) }),
    );
    expect(res.status).toBe(403);
  });

  it("caretaker with manage_tenants is allowed", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc(["manage_tenants"])));
    user.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest("/api/v1/users/search?email=a@b.co", { token: signToken(CARE_ID) }),
    );
    expect(res.status).toBe(200);
  });

  it("returns the matched user with hasVerifiedEmail", async () => {
    const found = makeUser({
      _id: makeObjectId("found"),
      name: "Found User",
      email: "found@keja.co",
      role: "tenant",
      isActive: true,
      isVerified: true,
    });
    user.findOne.mockReturnValue(buildQuery(found));

    const res = await GET(
      buildRequest("/api/v1/users/search?email=FOUND@keja.co", { token: signToken(OWNER_ID) }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toHaveLength(1);
    expect((body.data as Array<Record<string, unknown>>)[0]).toMatchObject({
      id: found._id,
      name: "Found User",
      email: "found@keja.co",
      role: "tenant",
      isActive: true,
      hasVerifiedEmail: true,
    });
    expect(user.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        email: expect.objectContaining({ $regex: expect.any(RegExp) }),
      }),
    );
  });

  it("returns an empty array when nothing matches", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    user.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest("/api/v1/users/search?phone=0712345678", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
  });
});
