/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeProperty, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));

import { GET } from "@/app/api/v1/chat/contacts/route";

const { user, property, tenant } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const PROPERTY_ID = makeObjectId("p1");

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

it("401 when unauthenticated", async () => {
  const res = await GET(buildRequest("/api/v1/chat/contacts"));
  expect(res.status).toBe(401);
});

it("403 for a non-tenant", async () => {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));

  const res = await GET(buildRequest("/api/v1/chat/contacts", { token: signToken(OWNER_ID) }));
  expect(res.status).toBe(403);
});

describe("GET /api/v1/chat/contacts", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("returns the tenant's owner and caretakers with property context", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: makeObjectId("tenant"), propertyId: PROPERTY_ID })]),
    );
    property.find.mockReturnValue(
      buildQuery([
        makeProperty({
          _id: PROPERTY_ID,
          title: "Sunset Villa",
          ownerId: OWNER_ID,
          caretakerIds: [CARETAKER_ID],
        }),
      ]),
    );
    user.find.mockReturnValue(
      buildQuery([
        { _id: OWNER_ID, name: "Test Owner", role: "owner" },
        { _id: CARETAKER_ID, name: "John Kiprono", role: "caretaker" },
      ]),
    );

    const res = await GET(buildRequest("/api/v1/chat/contacts", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<Record<string, unknown>>;
    };

    expect(body.data).toEqual([
      {
        userId: OWNER_ID,
        name: "Test Owner",
        role: "owner",
        propertyId: PROPERTY_ID,
        property: "Sunset Villa",
      },
      {
        userId: CARETAKER_ID,
        name: "John Kiprono",
        role: "caretaker",
        propertyId: PROPERTY_ID,
        property: "Sunset Villa",
      },
    ]);
  });

  it("returns an empty list when the tenant has no tenancy", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/chat/contacts", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});
