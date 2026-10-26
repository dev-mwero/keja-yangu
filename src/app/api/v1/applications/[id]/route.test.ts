/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUnit, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Application", () => ({ Application: getModelStubs().application }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));

import { DELETE, PATCH } from "@/app/api/v1/applications/[id]/route";

const { user, application, tenant, unit, lease, property } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const TENANT_DOC_ID = makeObjectId("tenant-doc");
const PROP_ID = makeObjectId("prop");
const OTHER_PROP_ID = makeObjectId("other-prop");
const UNIT_ID = makeObjectId("unit");
const APP_ID = makeObjectId("app");

function appDoc(overrides: Record<string, unknown> = {}) {
  const doc = {
    _id: APP_ID,
    propertyId: PROP_ID,
    ownerId: OWNER_ID,
    applicantUserId: TENANT_ID,
    applicantName: "Amina",
    applicantEmail: "amina@keja.co",
    status: "pending",
    decisionNote: "",
    decidedById: "",
    save: vi.fn<() => Promise<unknown>>(),
    toObject: vi.fn<() => unknown>(),
    ...overrides,
  };
  doc.save.mockResolvedValue(doc);
  doc.toObject.mockReturnValue(doc);
  return doc;
}

function authOwner() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: OWNER_ID, role: "owner" })));
}

function authTenant() {
  user.findById.mockReturnValue(buildQuery(makeUser({ _id: TENANT_ID, role: "tenant" })));
}

describe("PATCH /api/v1/applications/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the application does not exist", async () => {
    authOwner();
    application.findById.mockResolvedValue(null);
    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(404);
  });

  it("400 for an invalid decision payload", async () => {
    authOwner();
    application.findById.mockResolvedValue(appDoc());
    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "pending" },
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(400);
  });

  it("403 when a custodian decides a foreign owner's application", async () => {
    user.findById.mockReturnValue(
      buildQuery(
        makeUser({ _id: CUSTODIAN_ID, role: "custodian", managedByOwnerId: OTHER_OWNER_ID }),
      ),
    );
    application.findById.mockResolvedValue(appDoc());
    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(CUSTODIAN_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(403);
  });

  it("lets the owner approve an application", async () => {
    authOwner();
    const doc = appDoc();
    application.findById.mockResolvedValue(doc);
    tenant.findOne.mockReturnValue(buildQuery(null));
    tenant.create.mockResolvedValue({ _id: makeObjectId("created-tenant") });

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved", decisionNote: "Welcome" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(200);
    expect(doc.status).toBe("approved");
    expect(doc.decidedById).toBe(OWNER_ID);
    expect(doc.decisionNote).toBe("Welcome");
    expect(doc.save).toHaveBeenCalled();
    // Approving admits the applicant as a tenant of the property.
    expect(tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: PROP_ID,
        ownerId: OWNER_ID,
        email: "amina@keja.co",
        status: "active",
        userId: TENANT_ID,
      }),
    );
  });

  it("binds an existing tenant instead of duplicating on approval", async () => {
    authOwner();
    const doc = appDoc();
    application.findById.mockResolvedValue(doc);
    tenant.findOne.mockReturnValue(buildQuery({ _id: makeObjectId("existing") }));
    tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(200);
    expect(tenant.create).not.toHaveBeenCalled();
    expect(tenant.updateOne).toHaveBeenCalledWith(
      { _id: makeObjectId("existing") },
      expect.objectContaining({
        $set: expect.objectContaining({ userId: TENANT_ID, status: "active" }),
      }),
    );
  });

  it("does not admit a tenant when rejecting", async () => {
    authOwner();
    const doc = appDoc();
    application.findById.mockResolvedValue(doc);

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "rejected" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(200);
    expect(tenant.create).not.toHaveBeenCalled();
    expect(tenant.updateOne).not.toHaveBeenCalled();
  });

  it("allocates the requested unit on approval", async () => {
    authOwner();
    const doc = appDoc({ unitId: UNIT_ID });
    application.findById.mockResolvedValue(doc);

    const tenantDoc = {
      _id: TENANT_DOC_ID,
      email: "amina@keja.co",
      userId: TENANT_ID,
      propertyId: PROP_ID,
      ownerId: OWNER_ID,
      status: "pending",
    };
    const unitDoc = makeUnit({ _id: UNIT_ID, propertyId: PROP_ID, status: "available" });
    const claimed = { ...unitDoc, status: "occupied", tenantId: TENANT_ID };

    tenant.findOne.mockReturnValue(buildQuery(null));
    tenant.create.mockResolvedValue({ _id: TENANT_DOC_ID });
    tenant.findById.mockReturnValue(buildQuery(tenantDoc));
    unit.findById.mockReturnValue(buildQuery(unitDoc));
    unit.findOneAndUpdate.mockReturnValue(buildQuery(claimed));
    unit.updateMany.mockResolvedValue({ modifiedCount: 0 });
    tenant.updateOne.mockResolvedValue({ modifiedCount: 1 });
    lease.findOne.mockReturnValue(buildQuery(null));
    property.findById.mockReturnValue(buildQuery({ price: 45000 }));
    lease.create.mockResolvedValue({ _id: makeObjectId("lease"), unitId: UNIT_ID });

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(200);
    expect(doc.status).toBe("approved");
    expect(doc.save).toHaveBeenCalled();
    expect(unit.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: UNIT_ID, status: "available", deletedAt: null },
      { $addToSet: { tenantId: TENANT_ID }, $set: { status: "occupied" } },
      { new: true },
    );
    expect(lease.create).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: UNIT_ID, status: "active" }),
    );
  });

  it("keeps the application pending when the unit is taken", async () => {
    authOwner();
    const doc = appDoc({ unitId: UNIT_ID });
    application.findById.mockResolvedValue(doc);

    const tenantDoc = {
      _id: TENANT_DOC_ID,
      email: "amina@keja.co",
      userId: TENANT_ID,
      propertyId: PROP_ID,
      ownerId: OWNER_ID,
      status: "pending",
    };
    const unitDoc = makeUnit({ _id: UNIT_ID, propertyId: PROP_ID, status: "occupied" });

    tenant.findOne.mockReturnValue(buildQuery(null));
    tenant.create.mockResolvedValue({ _id: TENANT_DOC_ID });
    tenant.findById.mockReturnValue(buildQuery(tenantDoc));
    unit.findById.mockReturnValue(buildQuery(unitDoc));
    unit.findOneAndUpdate.mockReturnValue(buildQuery(null));

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(409);
    expect(doc.status).toBe("pending");
    expect(doc.save).not.toHaveBeenCalled();
    expect(lease.create).not.toHaveBeenCalled();
  });

  it("rejects a unit belonging to another property", async () => {
    authOwner();
    const doc = appDoc({ unitId: UNIT_ID });
    application.findById.mockResolvedValue(doc);

    const tenantDoc = {
      _id: TENANT_DOC_ID,
      email: "amina@keja.co",
      userId: TENANT_ID,
      propertyId: PROP_ID,
      ownerId: OWNER_ID,
      status: "pending",
    };
    const unitDoc = makeUnit({ _id: UNIT_ID, propertyId: OTHER_PROP_ID, status: "available" });

    tenant.findOne.mockReturnValue(buildQuery(null));
    tenant.create.mockResolvedValue({ _id: TENANT_DOC_ID });
    tenant.findById.mockReturnValue(buildQuery(tenantDoc));
    unit.findById.mockReturnValue(buildQuery(unitDoc));

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(422);
    expect(doc.status).toBe("pending");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("is idempotent when re-approving an already approved application", async () => {
    authOwner();
    const doc = appDoc({ unitId: UNIT_ID, status: "approved" });
    application.findById.mockResolvedValue(doc);

    const res = await PATCH(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { status: "approved" },
      }),
      withParams(APP_ID),
    );

    expect(res.status).toBe(200);
    expect(tenant.create).not.toHaveBeenCalled();
    expect(tenant.updateOne).not.toHaveBeenCalled();
    expect(unit.findOneAndUpdate).not.toHaveBeenCalled();
    expect(lease.create).not.toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/applications/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await DELETE(
      buildRequest(`/api/v1/applications/${APP_ID}`, { method: "DELETE" }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the application does not exist", async () => {
    authTenant();
    application.findById.mockReturnValue(buildQuery(null));
    const res = await DELETE(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "DELETE",
        token: signToken(TENANT_ID),
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 when a different tenant withdraws it", async () => {
    authTenant();
    application.findById.mockReturnValue(
      buildQuery({ applicantUserId: makeObjectId("someone-else"), status: "pending" }),
    );
    const res = await DELETE(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "DELETE",
        token: signToken(TENANT_ID),
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 when the application is not pending", async () => {
    authTenant();
    application.findById.mockReturnValue(
      buildQuery({ applicantUserId: TENANT_ID, status: "approved" }),
    );
    const res = await DELETE(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "DELETE",
        token: signToken(TENANT_ID),
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(400);
  });

  it("lets the owning tenant withdraw a pending application", async () => {
    authTenant();
    application.findById.mockReturnValue(
      buildQuery({ applicantUserId: TENANT_ID, status: "pending" }),
    );
    application.softDeleteById.mockResolvedValue({ modifiedCount: 1 });

    const res = await DELETE(
      buildRequest(`/api/v1/applications/${APP_ID}`, {
        method: "DELETE",
        token: signToken(TENANT_ID),
      }),
      withParams(APP_ID),
    );
    expect(res.status).toBe(200);
    expect(application.softDeleteById).toHaveBeenCalledWith(APP_ID);
  });
});
