/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Application", () => ({ Application: getModelStubs().application }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));

import { GET, POST } from "@/app/api/v1/applications/route";

const { user, property, application, unit } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");
const PROP_ID = makeObjectId("prop");

function listResult(docs: unknown[]) {
  application.find.mockReturnValue(buildQuery(docs));
  application.countDocuments.mockResolvedValue(docs.length);
}

function availablePropertyDoc() {
  return { _id: PROP_ID, ownerId: OWNER_ID, published: true, status: "available" };
}

describe("GET /api/v1/applications", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/applications"));
    expect(res.status).toBe(401);
  });

  it("scopes an owner to applications against their portfolio", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    listResult([]);
    const res = await GET(buildRequest("/api/v1/applications", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(application.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("scopes a tenant to their own applications", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    listResult([]);
    const res = await GET(buildRequest("/api/v1/applications", { token: signToken(TENANT_ID) }));
    expect(res.status).toBe(200);
    expect(application.find).toHaveBeenCalledWith({ applicantUserId: TENANT_ID });
  });

  it("scopes a custodian to their managing owner", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OWNER_ID })),
    );
    listResult([]);
    const res = await GET(buildRequest("/api/v1/applications", { token: signToken(CUSTODIAN_ID) }));
    expect(res.status).toBe(200);
    expect(application.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("scopes a caretaker to assigned properties of the managing owner", async () => {
    user.findById.mockReturnValue(
      buildQuery(makeUser({ _id: CARETAKER_ID, role: "caretaker", managedByOwnerId: OWNER_ID })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID }]));
    listResult([]);

    const res = await GET(buildRequest("/api/v1/applications", { token: signToken(CARETAKER_ID) }));
    expect(res.status).toBe(200);
    expect(property.find).toHaveBeenCalledWith({
      caretakerIds: CARETAKER_ID,
      ownerId: OWNER_ID,
    });
    expect(application.find).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      propertyId: { $in: [PROP_ID] },
    });
  });

  it("enriches results with property titles", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    listResult([
      {
        _id: makeObjectId("app"),
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        applicantUserId: TENANT_ID,
        applicantName: "Amina",
        applicantEmail: "amina@keja.co",
        status: "pending",
      },
    ]);
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, title: "Sunset Villa" }]));

    const res = await GET(buildRequest("/api/v1/applications", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data[0]).toMatchObject({ propertyTitle: "Sunset Villa" });
  });

  it("enriches results with the requested unit name", async () => {
    const UNIT_ID = makeObjectId("unit");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    listResult([
      {
        _id: makeObjectId("app"),
        propertyId: PROP_ID,
        unitId: UNIT_ID,
        ownerId: OWNER_ID,
        applicantUserId: TENANT_ID,
        applicantName: "Amina",
        applicantEmail: "amina@keja.co",
        status: "pending",
      },
    ]);
    property.find.mockReturnValue(buildQuery([{ _id: PROP_ID, title: "Sunset Villa" }]));
    unit.find.mockReturnValue(buildQuery([{ _id: UNIT_ID, name: "3A" }]));

    const res = await GET(buildRequest("/api/v1/applications", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(unit.find).toHaveBeenCalledWith({ _id: { $in: [UNIT_ID] } });
    const json = await res.json();
    expect(json.data[0]).toMatchObject({ propertyTitle: "Sunset Villa", unitName: "3A" });
  });
});

describe("POST /api/v1/applications", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        body: { propertyId: PROP_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("400 for an invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, email: "not-an-email" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("403 when a non-tenant applies", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { propertyId: PROP_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(403);
    expect(application.create).not.toHaveBeenCalled();
  });

  it("404 when the property does not exist", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("409 when a pending application already exists", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(availablePropertyDoc()));
    application.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("app") }));

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(409);
    expect(application.create).not.toHaveBeenCalled();
  });

  it("201 creates an application for a tenant with the resolved owner", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(availablePropertyDoc()));
    application.findOne.mockReturnValue(buildQuery(null));
    application.create.mockResolvedValue({ _id: makeObjectId("app") });

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: {
          propertyId: PROP_ID,
          name: "Amina",
          email: "AMINA@keja.co",
          message: "Interested",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(application.create).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        applicantUserId: TENANT_ID,
        applicantName: "Amina",
        applicantEmail: "amina@keja.co",
        status: "pending",
      }),
    );
  });

  it("409 when the property is not accepting applications", async () => {
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(
      buildQuery({ _id: PROP_ID, ownerId: OWNER_ID, published: false, status: "available" }),
    );

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(409);
    expect(application.create).not.toHaveBeenCalled();
  });

  it("201 stores the requested unitId", async () => {
    const UNIT_ID = makeObjectId("unit");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(availablePropertyDoc()));
    application.findOne.mockReturnValue(buildQuery(null));
    unit.findById.mockReturnValue(
      buildQuery({ _id: UNIT_ID, propertyId: PROP_ID, status: "available" }),
    );
    application.create.mockResolvedValue({ _id: makeObjectId("app"), unitId: UNIT_ID });

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: {
          propertyId: PROP_ID,
          unitId: UNIT_ID,
          name: "Amina",
          email: "amina@keja.co",
        },
      }),
    );
    expect(res.status).toBe(201);
    expect(unit.findById).toHaveBeenCalledWith(UNIT_ID);
    expect(application.create).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: PROP_ID, unitId: UNIT_ID }),
    );
  });

  it("404 when the requested unit does not exist", async () => {
    const UNIT_ID = makeObjectId("unit");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(availablePropertyDoc()));
    application.findOne.mockReturnValue(buildQuery(null));
    unit.findById.mockReturnValue(buildQuery(null));

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, unitId: UNIT_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(404);
    expect(application.create).not.toHaveBeenCalled();
  });

  it("400 when the unit belongs to another property", async () => {
    const UNIT_ID = makeObjectId("unit");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(availablePropertyDoc()));
    application.findOne.mockReturnValue(buildQuery(null));
    unit.findById.mockReturnValue(
      buildQuery({ _id: UNIT_ID, propertyId: makeObjectId("other"), status: "available" }),
    );

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, unitId: UNIT_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(400);
    expect(application.create).not.toHaveBeenCalled();
  });

  it("409 when the requested unit is no longer available", async () => {
    const UNIT_ID = makeObjectId("unit");
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
    property.findById.mockReturnValue(buildQuery(availablePropertyDoc()));
    application.findOne.mockReturnValue(buildQuery(null));
    unit.findById.mockReturnValue(
      buildQuery({ _id: UNIT_ID, propertyId: PROP_ID, status: "occupied" }),
    );

    const res = await POST(
      buildRequest("/api/v1/applications", {
        method: "POST",
        token: signToken(TENANT_ID),
        body: { propertyId: PROP_ID, unitId: UNIT_ID, name: "Amina", email: "amina@keja.co" },
      }),
    );
    expect(res.status).toBe(409);
    expect(application.create).not.toHaveBeenCalled();
  });
});
