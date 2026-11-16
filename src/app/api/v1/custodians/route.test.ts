/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
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
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));

import { GET, POST } from "@/app/api/v1/custodians/route";
import { writeAuditEvent } from "@/lib/audit";
import { sendInviteEmail } from "@/lib/email";

const { user, property, managementAssignment } = getModelStubs();
const PROP_ID = makeObjectId("prop");

const OWNER_ID = makeObjectId("admin");
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
    vi.mocked(writeAuditEvent).mockClear();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/custodians"));
    expect(res.status).toBe(401);
  });

  it("403 for a custodian (non-owner)", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    const res = await GET(buildRequest("/api/v1/custodians", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(403);
  });

  it("lists same-owner custodians with limited fields for property assignment", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian" })));
    const chain = buildQuery([custodianDoc()]);
    user.find.mockReturnValue(chain);
    managementAssignment.find
      .mockReturnValueOnce(
        buildQuery([
          {
            principalUserId: CUSTODIAN_ID,
            accessRole: "custodian",
            scopeType: "property",
            propertyId: PROP_ID,
            status: "active",
          },
        ]),
      )
      .mockReturnValue(
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
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, ownerId: OWNER_ID }]));

    const res = await GET(
      buildRequest("/api/v1/custodians", {
        token: signToken(CUSTODIAN_ID),
        query: { forPropertyAssignment: "true" },
      }),
    );

    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({
      role: "custodian",
      isActive: { $ne: false },
      isVerified: { $ne: false },
      _id: { $in: [CUSTODIAN_ID] },
    });
    expect(chain.select).toHaveBeenCalledWith("name");
    const data = (await json(res)).data as Array<Record<string, unknown>>;
    expect(data[0]).toMatchObject({ id: CUSTODIAN_ID, name: "Custodian One" });
    expect(data[0].email).toBeUndefined();
    expect(data[0].phone).toBe("");
    expect(data[0].privileges).toEqual([]);
  });

  it("403 when an owner queries another owner's custodians", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
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
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, ownerId: OWNER_ID }]));
    const res = await GET(
      buildRequest("/api/v1/custodians", {
        token: signToken(ADMIN_ID),
        query: { ownerId: OWNER_ID },
      }),
    );
    expect(res.status).toBe(200);
    expect(user.find).toHaveBeenCalledWith({
      role: "custodian",
      _id: { $in: [CUSTODIAN_ID] },
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
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "admin" })));
    const res = await POST(
      buildRequest("/api/v1/custodians", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { email: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
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
