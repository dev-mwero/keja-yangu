/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeChatThread, makeObjectId, makeTenant, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/ChatThread", () => ({ ChatThread: getModelStubs().chatthread }));

import { POST } from "@/app/api/v1/chat/threads/[id]/read/route";

const { user, tenant, chatthread } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const AGENT_ID = makeObjectId("agent");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const THREAD_ID = makeObjectId("thread");
const INVALID_ID = "not-an-objectid";

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function threadRow() {
  return makeChatThread({
    _id: THREAD_ID,
    tenantId: TENANT_ID,
    propertyId: PROPERTY_ID,
    ownerId: OWNER_ID,
    agentUserId: AGENT_ID,
    agentRole: "caretaker",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/v1/chat/threads/[id]/read", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid thread id", async () => {
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${INVALID_ID}/read`, {
        method: "POST",
        token: signToken(USER_ID),
        body: {},
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/read`, { method: "POST", body: {} }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(401);
  });

  it("tenant marks their side read", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]),
    );
    chatthread.findById.mockReturnValue(buildQuery(threadRow()));
    chatthread.updateOne.mockResolvedValue({ acknowledged: true });

    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/read`, {
        method: "POST",
        token: signToken(USER_ID),
        body: {},
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(200);
    const update = chatthread.updateOne.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set.tenantLastReadAt).toBeInstanceOf(Date);
    expect(update.$set.agentLastReadAt).toBeUndefined();
    const body = await json(res);
    expect(body.data).toMatchObject({ readAt: expect.any(String) });
  });

  it("owner marks their side read", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    chatthread.findById.mockReturnValue(buildQuery(threadRow()));
    chatthread.updateOne.mockResolvedValue({ acknowledged: true });

    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/read`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(200);
    const update = chatthread.updateOne.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set.agentLastReadAt).toBeInstanceOf(Date);
  });

  it("404 for a thread outside the participant set", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    chatthread.findById.mockReturnValue(
      buildQuery(makeChatThread({ _id: THREAD_ID, ownerId: makeObjectId("other") })),
    );
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/read`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(404);
    expect(chatthread.updateOne).not.toHaveBeenCalled();
  });
});
