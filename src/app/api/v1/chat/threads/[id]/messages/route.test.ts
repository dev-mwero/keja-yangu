/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import {
  makeChatMessage,
  makeChatThread,
  makeObjectId,
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

import { GET, POST } from "@/app/api/v1/chat/threads/[id]/messages/route";

const { user, tenant, property, chatthread, chatmessage } = getModelStubs();

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const AGENT_ID = makeObjectId("agent");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("p1");
const THREAD_ID = makeObjectId("thread");
const MESSAGE_ID = makeObjectId("message");
const INVALID_ID = "not-an-objectid";

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

function tenantWithRows() {
  return buildQuery([makeTenant({ _id: TENANT_ID, propertyId: PROPERTY_ID, userId: USER_ID })]);
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/chat/threads/[id]/messages", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid thread id", async () => {
    const res = await GET(
      buildRequest(`/api/v1/chat/threads/${INVALID_ID}/messages`, { token: signToken(USER_ID) }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 for a thread the tenant does not participate in", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(tenantWithRows());
    // tenantId on the thread differs from the actor's bound TENANT_ID
    const foreign = makeChatThread({ _id: THREAD_ID, tenantId: makeObjectId("other") });
    chatthread.findById.mockReturnValue(buildQuery(foreign));

    const res = await GET(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, { token: signToken(USER_ID) }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(404);
    expect(chatmessage.find).not.toHaveBeenCalled();
  });

  it("returns the newest 100 messages ascending with sender mapped to me/them", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(tenantWithRows());
    chatthread.findById.mockReturnValue(buildQuery(threadRow()));
    const own = makeChatMessage({
      _id: MESSAGE_ID,
      threadId: THREAD_ID,
      senderUserId: USER_ID,
      senderRole: "tenant",
      text: "Anytime.",
    });
    const theirs = makeChatMessage({
      _id: makeObjectId("m2"),
      threadId: THREAD_ID,
      senderUserId: AGENT_ID,
      senderRole: "caretaker",
      text: "Water tanks Thursday.",
    });
    chatmessage.find.mockReturnValue(buildQuery([theirs, own]).sort({ createdAt: -1 }).limit(100));

    const res = await GET(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, { token: signToken(USER_ID) }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(200);
    expect(chatmessage.find).toHaveBeenCalledWith({ threadId: THREAD_ID });
    const body = await json(res);
    const data = body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    // Descending fetch reversed back to ascending chronological order.
    expect(data[0]._id).toBe(MESSAGE_ID);
    expect(data[0].sender).toBe("me");
    expect(data[1].sender).toBe("them");
  });
});

describe("POST /api/v1/chat/threads/[id]/messages", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid thread id", async () => {
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${INVALID_ID}/messages`, {
        method: "POST",
        token: signToken(USER_ID),
        body: { text: "Hello" },
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        body: { text: "Hello" },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(401);
  });

  it("403 for a mismatched origin", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        token: signToken(USER_ID),
        headers: { origin: "http://evil.example" },
        body: { text: "Hello" },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid message payload", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        token: signToken(USER_ID),
        body: { text: "   " },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 for a foreign thread", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(tenantWithRows());
    chatthread.findById.mockReturnValue(
      buildQuery(makeChatThread({ _id: THREAD_ID, tenantId: makeObjectId("other") })),
    );
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        token: signToken(USER_ID),
        body: { text: "Hello" },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(404);
    expect(chatmessage.create).not.toHaveBeenCalled();
  });

  it("creates a tenant message, bumps the thread and echoes sender me", async () => {
    user.findById.mockReturnValue(buildQuery(tenantUser()));
    tenant.find.mockReturnValue(tenantWithRows());
    chatthread.findById.mockReturnValue(buildQuery(threadRow()));
    const created = makeChatMessage({
      _id: MESSAGE_ID,
      threadId: THREAD_ID,
      senderUserId: USER_ID,
      senderRole: "tenant",
      text: "Hello",
    });
    chatmessage.create.mockResolvedValue(created);
    chatthread.updateOne.mockResolvedValue({ acknowledged: true });

    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        token: signToken(USER_ID),
        body: { text: "Hello" },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(201);
    expect(chatmessage.create).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      senderUserId: USER_ID,
      senderRole: "tenant",
      text: "Hello",
    });
    const update = chatthread.updateOne.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set.lastMessageText).toBe("Hello");
    expect(update.$set.lastMessageAt).toBeInstanceOf(Date);
    expect(update.$set.tenantLastReadAt).toBeInstanceOf(Date);
    const body = await json(res);
    expect((body.data as { sender?: string }).sender).toBe("me");
  });

  it("403 when a caretaker without send_messages posts", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(caretakerUser([])))
      .mockReturnValueOnce(buildQuery(caretakerUser([])))
      .mockReturnValueOnce(buildQuery(caretakerUser([])));
    property.find.mockReturnValue(buildQuery([]));
    chatthread.findById.mockReturnValue(buildQuery(threadRow()));
    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        token: signToken(AGENT_ID),
        body: { text: "Hello" },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(403);
    expect(chatmessage.create).not.toHaveBeenCalled();
  });

  it("an owner sends on their own property thread", async () => {
    user.findById
      .mockReturnValueOnce(buildQuery(ownerUser()))
      .mockReturnValueOnce(buildQuery(ownerUser()));
    chatthread.findById.mockReturnValue(buildQuery(threadRow()));
    const created = makeChatMessage({
      _id: MESSAGE_ID,
      threadId: THREAD_ID,
      senderUserId: OWNER_ID,
      senderRole: "owner",
      text: "Noted",
    });
    chatmessage.create.mockResolvedValue(created);
    chatthread.updateOne.mockResolvedValue({ acknowledged: true });

    const res = await POST(
      buildRequest(`/api/v1/chat/threads/${THREAD_ID}/messages`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { text: "Noted" },
      }),
      withParams(THREAD_ID),
    );
    expect(res.status).toBe(201);
    const update = chatthread.updateOne.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set.agentLastReadAt).toBeInstanceOf(Date);
    expect(update.$set.tenantLastReadAt).toBeUndefined();
  });
});
