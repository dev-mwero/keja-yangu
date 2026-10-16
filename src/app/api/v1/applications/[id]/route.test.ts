/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Application", () => ({ Application: getModelStubs().application }));

import { DELETE, PATCH } from "@/app/api/v1/applications/[id]/route";

const { user, application } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CUSTODIAN_ID = makeObjectId("custodian");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const TENANT_ID = makeObjectId("tenant");
const PROP_ID = makeObjectId("prop");
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
