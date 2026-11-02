/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));
vi.mock("@/models/AuditEvent", () => ({ AuditEvent: getModelStubs().auditEvent }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));

import { POST as accept } from "@/app/api/v1/assignments/[id]/accept/route";
import { POST as revoke } from "@/app/api/v1/assignments/[id]/revoke/route";
import { GET, POST } from "@/app/api/v1/assignments/route";

const models = getModelStubs();
const ACTOR_ID = makeObjectId("actor");
const PRINCIPAL_ID = makeObjectId("principal");
const PROPERTY_ID = makeObjectId("property");
const ASSIGNMENT_ID = makeObjectId("assignment");

function mockUsers(actorRole = "admin", principalRole = "admin") {
  models.user.findById.mockImplementation((id: unknown) =>
    buildQuery({
      _id: String(id),
      role: String(id) === String(ACTOR_ID) ? actorRole : principalRole,
      isActive: true,
    }),
  );
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    _id: ASSIGNMENT_ID,
    principalUserId: ACTOR_ID,
    accessRole: "admin",
    scopeType: "property",
    propertyId: PROPERTY_ID,
    blockId: "",
    unitId: "",
    permissions: ["assignment:read", "assignment:grant", "assignment:revoke", "unit:read"],
    status: "active",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  resetModelStubs();
  mockUsers("system-admin", "admin");
  models.property.findById.mockReturnValue(
    buildQuery({ _id: PROPERTY_ID, lifecycleState: "active" }),
  );
  models.managementAssignment.find.mockReturnValue(buildQuery([]));
  models.managementAssignment.findOne.mockReturnValue(buildQuery(null));
  models.auditEvent.create.mockResolvedValue({});
});

describe("GET /api/v1/assignments", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/assignments"));
    expect(res.status).toBe(401);
  });

  it("returns the actor's own assignments without a property filter", async () => {
    mockUsers("admin", "admin");
    models.managementAssignment.find.mockReturnValue(buildQuery([assignment()]));

    const res = await GET(buildRequest("/api/v1/assignments", { token: signToken(ACTOR_ID) }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { id: string }[] };
    expect(body.data[0].id).toBe(String(ASSIGNMENT_ID));
    expect(models.managementAssignment.find).toHaveBeenCalledWith({
      principalUserId: ACTOR_ID,
    });
  });

  it("returns property assignments to an actor with read authority", async () => {
    mockUsers("admin", "admin");
    models.managementAssignment.find.mockReturnValue(buildQuery([assignment()]));

    const res = await GET(
      buildRequest("/api/v1/assignments", {
        token: signToken(ACTOR_ID),
        query: { propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(200);
    expect(models.managementAssignment.find).toHaveBeenCalledWith({
      propertyId: PROPERTY_ID,
    });
  });

  it("403 for a tenant requesting property assignments", async () => {
    mockUsers("tenant", "tenant");
    const res = await GET(
      buildRequest("/api/v1/assignments", {
        token: signToken(ACTOR_ID),
        query: { propertyId: PROPERTY_ID },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid status filter", async () => {
    const res = await GET(
      buildRequest("/api/v1/assignments", {
        token: signToken(ACTOR_ID),
        query: { status: "bogus" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/assignments", () => {
  const body = {
    principalUserId: PRINCIPAL_ID,
    accessRole: "admin",
    scopeType: "property",
    propertyId: PROPERTY_ID,
    permissions: ["unit:read"],
  };

  it("201 when a system-admin grants an assignment", async () => {
    models.managementAssignment.create.mockResolvedValue({
      _id: ASSIGNMENT_ID,
      grantedAt: new Date(),
    });

    const res = await POST(
      buildRequest("/api/v1/assignments", {
        method: "POST",
        token: signToken(ACTOR_ID),
        body,
      }),
    );
    expect(res.status).toBe(201);
    const data = (await res.json()) as { data: { assignmentId: string } };
    expect(data.data.assignmentId).toBe(String(ASSIGNMENT_ID));
  });

  it("400 for an invalid payload", async () => {
    const res = await POST(
      buildRequest("/api/v1/assignments", {
        method: "POST",
        token: signToken(ACTOR_ID),
        body: { ...body, permissions: ["not-an-action"] },
      }),
    );
    expect(res.status).toBe(400);
    expect(models.managementAssignment.create).not.toHaveBeenCalled();
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest("/api/v1/assignments", {
        method: "POST",
        token: signToken(ACTOR_ID),
        headers: { origin: "http://evil.example" },
        body,
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("assignment lifecycle routes", () => {
  it("accepts a pending assignment", async () => {
    const pending = assignment({
      principalUserId: PRINCIPAL_ID,
      status: "pending",
      permissions: ["unit:read"],
    });
    mockUsers("admin", "admin");
    models.managementAssignment.findOne.mockReturnValue(buildQuery(pending));
    models.managementAssignment.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...pending, status: "active" }),
    );

    const res = await accept(
      buildRequest(`/api/v1/assignments/${ASSIGNMENT_ID}/accept`, {
        method: "POST",
        token: signToken(PRINCIPAL_ID),
      }),
      withParams(String(ASSIGNMENT_ID)),
    );
    expect(res.status).toBe(200);
  });

  it("revokes an assignment with a reason", async () => {
    mockUsers("admin", "admin");
    models.managementAssignment.find.mockReturnValue(buildQuery([assignment()]));
    models.managementAssignment.findById.mockReturnValue(buildQuery(assignment()));
    models.managementAssignment.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const res = await revoke(
      buildRequest(`/api/v1/assignments/${ASSIGNMENT_ID}/revoke`, {
        method: "POST",
        token: signToken(ACTOR_ID),
        body: { reason: "No longer managing" },
      }),
      withParams(String(ASSIGNMENT_ID)),
    );
    expect(res.status).toBe(200);
  });

  it("400 when the revocation reason is missing", async () => {
    models.managementAssignment.findById.mockReturnValue(buildQuery(assignment()));
    const res = await revoke(
      buildRequest(`/api/v1/assignments/${ASSIGNMENT_ID}/revoke`, {
        method: "POST",
        token: signToken(ACTOR_ID),
        body: {},
      }),
      withParams(String(ASSIGNMENT_ID)),
    );
    expect(res.status).toBe(400);
  });

  it("400 for an invalid assignment id", async () => {
    const res = await accept(
      buildRequest("/api/v1/assignments/nope/accept", {
        method: "POST",
        token: signToken(ACTOR_ID),
      }),
      withParams("nope"),
    );
    expect(res.status).toBe(400);
  });
});
