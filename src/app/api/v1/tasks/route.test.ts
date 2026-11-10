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
vi.mock("@/models/Task", () => ({ Task: getModelStubs().task }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET, POST } from "@/app/api/v1/tasks/route";

const { user, property, task, managementAssignment } = getModelStubs();

const ADMIN_ID = makeObjectId("admin");
const TASK_ID = makeObjectId("task");
const PROPERTY_ID = makeObjectId("prop");

function adminUser() {
  return makeUser({ _id: ADMIN_ID, role: "admin" });
}

function adminAssignment() {
  managementAssignment.find.mockReturnValue(
    buildQuery([
      {
        principalUserId: ADMIN_ID,
        accessRole: "admin",
        scopeType: "property",
        propertyId: PROPERTY_ID,
        permissions: ["task:read-own", "task:create", "task:manage"],
        status: "active",
        startsAt: new Date("2026-01-01T00:00:00.000Z"),
        endsAt: null,
      },
    ]),
  );
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/tasks", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/tasks"));
    expect(res.status).toBe(401);
  });

  it("400 for an invalid status filter", async () => {
    user.findById.mockReturnValue(buildQuery(adminUser()));
    adminAssignment();
    task.find.mockReturnValue(buildQuery([]).sort({ createdAt: -1 }).skip(0).limit(20));
    task.countDocuments.mockResolvedValue(0);
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(
      buildRequest("/api/v1/tasks?status=bogus", { token: signToken(ADMIN_ID) }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid task status");
  });

  it("admin scopes to assigned properties and enriches the title", async () => {
    user.findById.mockReturnValue(buildQuery(adminUser()));
    adminAssignment();
    const row = {
      _id: TASK_ID,
      title: "Fix tap",
      propertyId: PROPERTY_ID,
      ownerId: ADMIN_ID,
      status: "open",
      priority: "medium",
      createdBy: ADMIN_ID,
      createdByRole: "admin",
      dueDate: "2026-01-10T00:00:00.000Z",
    };
    task.find.mockReturnValue(buildQuery([row]).sort({ createdAt: -1 }).skip(0).limit(20));
    task.countDocuments.mockResolvedValue(1);
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await GET(buildRequest("/api/v1/tasks", { token: signToken(ADMIN_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]._id).toBe(TASK_ID);
    expect(data[0].property).toBe("Sunlit Studio");
  });
});

describe("POST /api/v1/tasks", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/tasks", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("400 on invalid payload", async () => {
    user.findById.mockReturnValue(buildQuery(adminUser()));
    adminAssignment();

    const res = await POST(
      buildRequest("/api/v1/tasks", {
        method: "POST",
        body: { title: "" },
        token: signToken(ADMIN_ID),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a task and returns 201", async () => {
    user.findById.mockReturnValue(buildQuery(adminUser()));
    adminAssignment();
    const created = {
      _id: TASK_ID,
      title: "Fix tap",
      propertyId: PROPERTY_ID,
      ownerId: ADMIN_ID,
      status: "open",
      priority: "medium",
      createdBy: ADMIN_ID,
      createdByRole: "admin",
      createdByName: "Admin User",
      dueDate: "2026-01-10T00:00:00.000Z",
      toObject: () => ({
        _id: TASK_ID,
        title: "Fix tap",
        propertyId: PROPERTY_ID,
        ownerId: ADMIN_ID,
        status: "open",
        priority: "medium",
        createdBy: ADMIN_ID,
        createdByRole: "admin",
        createdByName: "Admin User",
        dueDate: "2026-01-10T00:00:00.000Z",
      }),
    };
    task.create.mockResolvedValue(created);
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));

    const res = await POST(
      buildRequest("/api/v1/tasks", {
        method: "POST",
        body: {
          title: "Fix tap",
          propertyId: PROPERTY_ID,
          priority: "medium",
          status: "open",
          dueDate: "2026-01-10",
        },
        token: signToken(ADMIN_ID),
      }),
    );
    expect(res.status).toBe(201);
    const body = await json(res);
    expect((body.data as Record<string, unknown>).title).toBe("Fix tap");
  });
});
