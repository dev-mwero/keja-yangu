import { describe, expect, it } from "vitest";
import { serializeMessage, serializeThread, type ThreadEnrichment } from "@/lib/chat";

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
