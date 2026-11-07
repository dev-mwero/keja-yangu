import { describe, expect, it } from "vitest";
import {
  countUnreadByThread,
  serializeMessage,
  serializeThread,
  type ThreadEnrichment,
} from "@/lib/chat";

const thread = {
  _id: "thread-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  ownerId: "owner-1",
  agentUserId: "agent-1",
  agentRole: "caretaker",
  lastMessageAt: new Date("2026-10-01T10:00:00.000Z"),
  lastMessageText: "Hello",
};

const enrichment: ThreadEnrichment = {
  agentName: "John Kiprono",
  tenantName: "Amina Otieno",
  propertyTitle: "Sunlit Studio",
  unread: 3,
};

describe("serializeThread", () => {
  it("shows a tenant the agent as the contact", () => {
    const view = serializeThread(thread, enrichment, "tenant");
    expect(view.contact).toBe("John Kiprono");
    expect(view.role).toBe("Caretaker");
    expect(view.lastAt).toBe("2026-10-01T10:00:00.000Z");
    expect(view.unread).toBe(3);
  });

  it("shows an owner the tenant as the contact", () => {
    const view = serializeThread(thread, enrichment, "owner");
    expect(view.contact).toBe("Amina Otieno");
    expect(view.role).toBe("Tenant");
  });

  it("shows a caretaker the tenant as the contact", () => {
    const view = serializeThread(thread, enrichment, "caretaker");
    expect(view.contact).toBe("Amina Otieno");
    expect(view.role).toBe("Tenant");
  });
});

describe("serializeMessage", () => {
  it("marks the actor's own messages as me", () => {
    const message = {
      _id: "message-1",
      senderUserId: "user-1",
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
    };
    expect(serializeMessage(message, "user-1")).toMatchObject({
      _id: "message-1",
      sender: "me",
      at: "2026-10-01T10:00:00.000Z",
    });
  });

  it("marks the other participant's messages as them", () => {
    const message = {
      _id: "message-1",
      senderUserId: "user-1",
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
    };
    expect(serializeMessage(message, "user-2").sender).toBe("them");
  });
});

describe("countUnreadByThread", () => {
  const threads = [
    { _id: "t1", tenantLastReadAt: new Date("2026-09-02T08:00:00.000Z") },
    { _id: "t2", tenantLastReadAt: new Date("2026-09-02T09:30:00.000Z") },
    { _id: "t3" },
  ];

  it("counts per-thread against the viewer's watermark", () => {
    const messages = [
      { threadId: "t1", createdAt: new Date("2026-09-02T08:15:00.000Z") }, // after t1 watermark
      { threadId: "t1", createdAt: new Date("2026-09-02T07:00:00.000Z") }, // before t1 watermark
      { threadId: "t2", createdAt: new Date("2026-09-02T09:00:00.000Z") }, // before t2 watermark
      { threadId: "t2", createdAt: new Date("2026-09-02T10:00:00.000Z") }, // after t2 watermark
      { threadId: "t3", createdAt: new Date("2026-01-01T00:00:00.000Z") }, // null watermark: counts all
      { threadId: "other", createdAt: new Date("2026-09-02T10:00:00.000Z") }, // not in the page
    ];
    const counts = countUnreadByThread(threads, "tenant", messages);
    expect(counts.get("t1")).toBe(1);
    expect(counts.get("t2")).toBe(1);
    expect(counts.get("t3")).toBe(1);
  });

  it("uses the agent watermark for staff viewers", () => {
    const staffThreads = [
      { _id: "t1", tenantLastReadAt: new Date("2026-01-01T00:00:00.000Z") },
      { _id: "t2", agentLastReadAt: new Date("2026-09-02T09:30:00.000Z") },
    ];
    const messages = [
      { threadId: "t1", createdAt: new Date("2026-09-02T08:15:00.000Z") }, // t1 has no agent watermark
      { threadId: "t2", createdAt: new Date("2026-09-02T10:00:00.000Z") }, // after t2 agent watermark
    ];
    const counts = countUnreadByThread(staffThreads, "owner", messages);
    expect(counts.get("t1")).toBe(1);
    expect(counts.get("t2")).toBe(1);
  });

  it("defaults every thread to zero with no candidates", () => {
    const counts = countUnreadByThread(threads, "tenant", []);
    expect(counts.get("t1")).toBe(0);
    expect(counts.get("t2")).toBe(0);
    expect(counts.get("t3")).toBe(0);
  });
});
