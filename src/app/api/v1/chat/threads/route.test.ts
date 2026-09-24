/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import {
  makeChatThread,
  makeObjectId,
  makeProperty,
  makeTenant,
  makeUser,
} from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/ChatThread", () => ({ ChatThread: getModelStubs().chatthread }));
vi.mock("@/models/ChatMessage", () => ({ ChatMessage: getModelStubs().chatmessage }));

import { GET, POST } from "@/app/api/v1/chat/threads/route";

const { user, property, tenant, chatthread, chatmessage } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const AGENT_ID = makeObjectId("agent");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const THREAD_ID = makeObjectId("thread");

function tenantUser() {
  return makeUser({ _id: USER_ID, role: "tenant" });
}

function ownerUser() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerUser(privileges: string[]) {
  return makeUser({
    _id: AGENT_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: privileges as never,
  });
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

describe("GET /api/v1/chat/threads", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest("/api/v1/chat/threads"));
    expect(res.status).toBe(401);
  });

  it("scopes threads to the tenant and computes per-thread unread", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({
          _id: TENANT_ID,
          propertyId: PROPERTY_ID,
          userId: USER_ID,
          name: "Amina Otieno",
        }),
      ]),
    );
    const row = threadRow();
    chatthread.find.mockReturnValue(
      buildQuery([row]).sort({ lastMessageAt: -1 }).skip(0).limit(20),
    );
    chatthread.countDocuments.mockResolvedValue(1);
    user.find.mockReturnValue(buildQuery([{ _id: AGENT_ID, name: "John Kiprono" }]));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    chatmessage.countDocuments.mockResolvedValue(2);

    const res = await GET(buildRequest("/api/v1/chat/threads", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    expect(chatthread.find).toHaveBeenCalledWith({ tenantId: { $in: [TENANT_ID] } });
    expect(chatmessage.countDocuments).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      senderUserId: { $ne: USER_ID },
      createdAt: { $gt: row.tenantLastReadAt },
    });
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0]._id).toBe(THREAD_ID);
    expect(data[0].contact).toBe("John Kiprono");
    expect(data[0].role).toBe("Caretaker");
    expect(data[0].property).toBe("Sunlit Studio");
    expect(data[0].unread).toBe(2);
    expect(data[0].lastMessageText).toBe(row.lastMessageText);
  });

  it("owner sees threads on their properties", async () => {
    user.findById.mockReturnValue(buildQuery(ownerUser()));
    const row = threadRow();
    chatthread.find.mockReturnValue(
      buildQuery([row]).sort({ lastMessageAt: -1 }).skip(0).limit(20),
    );
    chatthread.countDocuments.mockResolvedValue(1);
    user.find.mockReturnValue(buildQuery([{ _id: AGENT_ID, name: "John Kiprono" }]));
    tenant.find.mockReturnValue(buildQuery([{ _id: TENANT_ID, name: "Amina Otieno" }]));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    chatmessage.countDocuments.mockResolvedValue(0);

    const res = await GET(buildRequest("/api/v1/chat/threads", { token: signToken(OWNER_ID) }));
    expect(res.status).toBe(200);
    expect(chatthread.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
    expect(chatmessage.countDocuments).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      senderUserId: { $ne: OWNER_ID },
      createdAt: { $gt: row.agentLastReadAt },
    });
  });

  it("caretaker sees only threads where they are the agent", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser([])));
    chatthread.find.mockReturnValue(buildQuery([]).sort({ lastMessageAt: -1 }).skip(0).limit(20));
    chatthread.countDocuments.mockResolvedValue(0);
    user.find.mockReturnValue(buildQuery([]));
    tenant.find.mockReturnValue(buildQuery([]));
    property.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/chat/threads", { token: signToken(AGENT_ID) }));
    expect(res.status).toBe(200);
    expect(chatthread.find).toHaveBeenCalledWith({ agentUserId: AGENT_ID });
  });

  it("tenant with no bound rows gets an empty page", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(buildQuery([]));

    const res = await GET(buildRequest("/api/v1/chat/threads", { token: signToken(USER_ID) }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data).toEqual([]);
    expect(chatthread.find).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/chat/threads", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(buildRequest("/api/v1/chat/threads", { method: "POST", body: {} }));
    expect(res.status).toBe(401);
  });

  it("403 when a non-tenant starts a thread", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerUser([])));
    property.find.mockReturnValue(buildQuery([]));
    const res = await POST(
      buildRequest("/api/v1/chat/threads", {
        method: "POST",
        token: signToken(AGENT_ID),
        body: { recipientId: OWNER_ID, role: "owner" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("400 when the payload is invalid", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    const res = await POST(
      buildRequest("/api/v1/chat/threads", {
        method: "POST",
        token: signToken(USER_ID),
        body: { recipientId: "short", role: "owner" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates a thread with the pinned property and returns 201", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(tenantUser()))
      .mockReturnValueOnce(buildQuery(tenantUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValue(buildQuery(ownerUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, ownerId: OWNER_ID, userId: USER_ID }),
      ]),
    );
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] })),
    );
    const created = threadRow();
    chatthread.create.mockResolvedValue(created);
    chatthread.findById.mockReturnValue(buildQuery(created));
    tenant.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, name: "Amina Otieno" })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    chatmessage.countDocuments.mockResolvedValue(0);

    const res = await POST(
      buildRequest("/api/v1/chat/threads", {
        method: "POST",
        token: signToken(USER_ID),
        body: { recipientId: OWNER_ID, role: "owner" },
      }),
    );
    expect(res.status).toBe(201);
    expect(chatthread.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_ID,
        agentUserId: OWNER_ID,
        agentRole: "owner",
      }),
    );
    const body = await json(res);
    expect((body.data as { _id?: string })._id).toBe(THREAD_ID);
  });

  it("403 when the recipient is not the property owner or an assigned caretaker", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(tenantUser()))
      .mockReturnValueOnce(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, ownerId: OWNER_ID, userId: USER_ID }),
      ]),
    );
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] })),
    );

    const res = await POST(
      buildRequest("/api/v1/chat/threads", {
        method: "POST",
        token: signToken(USER_ID),
        body: { recipientId: makeObjectId("stranger"), role: "caretaker" },
      }),
    );
    expect(res.status).toBe(403);
    expect(chatthread.create).not.toHaveBeenCalled();
  });

  it("returns the existing thread with 200 on a duplicate-key race", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(tenantUser()))
      .mockReturnValueOnce(buildQuery(tenantUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValue(buildQuery(ownerUser()));
    tenant.find.mockReturnValue(
      buildQuery([
        makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, ownerId: OWNER_ID, userId: USER_ID }),
      ]),
    );
    property.findById.mockReturnValue(
      buildQuery(makeProperty({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] })),
    );
    chatthread.create.mockRejectedValue({ code: 11000 });
    const existing = threadRow();
    chatthread.findOne.mockReturnValue(buildQuery(existing));
    chatthread.findById.mockReturnValue(buildQuery(existing));
    tenant.findById.mockReturnValue(
      buildQuery(makeTenant({ _id: TENANT_ID, name: "Amina Otieno" })),
    );
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, title: "Sunlit Studio" }]));
    chatmessage.countDocuments.mockResolvedValue(0);

    const res = await POST(
      buildRequest("/api/v1/chat/threads", {
        method: "POST",
        token: signToken(USER_ID),
        body: { recipientId: OWNER_ID, role: "owner" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { _id?: string })._id).toBe(THREAD_ID);
  });
});
