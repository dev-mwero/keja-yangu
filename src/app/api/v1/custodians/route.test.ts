/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));

import { GET, POST } from "@/app/api/v1/custodians/route";
import { sendInviteEmail } from "@/lib/email";

const { user } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const ADMIN_ID = makeObjectId("admin");

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

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

describe("GET /api/v1/custodians", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/custodians"));
    expect(res.status).toBe(401);
  });

  it("403 for a custodian (non-owner)", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
    const res = await GET(buildRequest("/api/v1/custodians", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(403);
  });

  it("lists an owner's custodians", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    user.find.mockReturnValue(buildQuery([custodianDoc()]));

    const res = await GET(buildRequest("/api/v1/custodians", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({ role: "custodian", managedByOwnerId: OWNER_ID });
    const body = await json(res);
    expect(body.data).toHaveLength(1);
  });

  it("403 when an owner queries another owner's custodians", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await GET(
      buildRequest("/api/v1/custodians", {
        token: signToken(OWNER_ID),
        query: { ownerId: OTHER_OWNER_ID },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("lets a system-admin filter by owner", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    user.find.mockReturnValue(buildQuery([]));
    const res = await GET(
      buildRequest("/api/v1/custodians", {
        token: signToken(ADMIN_ID),
        query: { ownerId: OWNER_ID },
      }),
    );
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({
      role: "custodian",
      managedByOwnerId: OWNER_ID,
    });
  });
});

describe("POST /api/v1/custodians", () => {
  beforeEach(() => {
    resetModelStubs();
    vi.mocked(sendInviteEmail).mockClear();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/custodians", { method: "POST", body: { email: "x@y.co" } }),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a non-owner", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(CUSTODIAN_ID),
        body: { email: "new@keja.co" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid email", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("owner invites a brand-new custodian bound to themselves", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    user.findOne.mockReturnValue(buildQuery(null));
    user.create.mockResolvedValue(custodianDoc({ managedByOwnerId: OWNER_ID, isActive: false }));

    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "new@keja.co", name: "New Custodian" },
      }),
    );
    expect(res.status).toBe(201);
    expect(user.create).toHaveBeenCalledWith(
      expect.objectContaining({ role: "custodian", managedByOwnerId: OWNER_ID, isActive: false }),
    );
    expect(sendInviteEmail).toHaveBeenCalledWith("new@keja.co", expect.any(String), "custodian");
  });

  it("409 when the email belongs to a non-custodian account", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    user.findOne.mockReturnValue(buildQuery(makeUser({ _id: OTHER_OWNER_ID, role: "tenant" })));

    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "tenant@keja.co" },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("links an existing unbound custodian record", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    user.findOne.mockReturnValue(
      buildQuery(custodianDoc({ managedByOwnerId: "", isActive: false })),
    );

    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "custodian@keja.co" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.linked).toBe(true);
    expect(user.create).not.toHaveBeenCalled();
  });

  it("400 when a system-admin invites without an ownerId", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ADMIN_ID, role: "system-admin" })));
    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(ADMIN_ID),
        body: { email: "new@keja.co" },
      }),
    );
    expect(res.status).toBe(400);
  });
});
