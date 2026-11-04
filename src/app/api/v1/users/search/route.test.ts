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
    expect(user.findOne).toHaveBeenCalledWith({ email: "found@keja.co" });
  });

  it("returns an empty array when nothing matches", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    user.findOne.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest("/api/v1/users/search?phone=0712345678", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([]);
    expect(user.findOne).toHaveBeenCalledWith({ phone: "+254712345678" });
  });

  it("allows a custodian to check an existing caretaker for their owner", async () => {
    const custodian = makeUser({
      _id: makeObjectId("custodian"),
      role: "custodian",
      managedByOwnerId: OWNER_ID,
    });
    const found = makeUser({
      _id: makeObjectId("found-caretaker"),
      name: "Existing Caretaker",
      email: "care@keja.co",
      role: "caretaker",
      managedByOwnerId: OWNER_ID,
      isActive: true,
      isVerified: true,
    });
    user.findById.mockReturnValue(buildQuery(custodian));
    user.findOne.mockReturnValue(buildQuery(found));

    const res = await GET(
      buildRequest("/api/v1/users/search", {
        token: signToken(custodian._id),
        query: { email: found.email ?? "", role: "caretaker" },
      }),
    );

    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([
      expect.objectContaining({
        id: found._id,
        role: "caretaker",
        canLink: true,
      }),
    ]);
  });

  it("marks a matching account as not linkable when its role differs", async () => {
    const found = makeUser({
      _id: makeObjectId("found-tenant"),
      email: "tenant@keja.co",
      role: "tenant",
    });
    user.findOne.mockReturnValue(buildQuery(found));

    const res = await GET(
      buildRequest("/api/v1/users/search", {
        token: signToken(OWNER_ID),
        query: { email: "tenant@keja.co", role: "caretaker" },
      }),
    );

    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual([
      expect.objectContaining({
        role: "tenant",
        canLink: false,
        linkReason: "This contact is already registered to a different role.",
      }),
    ]);
  });

  it("returns a conflict if email and phone belong to different accounts", async () => {
    const emailUser = makeUser({ _id: makeObjectId("email-user"), email: "a@keja.co" });
    const phoneUser = makeUser({ _id: makeObjectId("phone-user"), phone: "+254712345678" });
    user.findOne
      .mockReturnValueOnce(buildQuery(emailUser))
      .mockReturnValueOnce(buildQuery(phoneUser));

    const res = await GET(
      buildRequest("/api/v1/users/search", {
        token: signToken(OWNER_ID),
        query: { email: "a@keja.co", phone: "+254712345678", role: "caretaker" },
      }),
    );

    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("Email and phone belong to different accounts");
  });

  it("forbids a custodian from searching outside their owner's portfolio", async () => {
    const custodian = makeUser({
      _id: makeObjectId("custodian"),
      role: "custodian",
      managedByOwnerId: OWNER_ID,
    });
    user.findById.mockReturnValue(buildQuery(custodian));

    const res = await GET(
      buildRequest("/api/v1/users/search", {
        token: signToken(custodian._id),
        query: {
          email: "care@keja.co",
          ownerId: makeObjectId("other-owner"),
          role: "caretaker",
        },
      }),
    );

    expect(res.status).toBe(403);
  });
});
