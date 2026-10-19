import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage, ChatThread } from "@/types/communications";

const mocks = vi.hoisted(() => {
  const threads: ChatThread[] = [];
  const messages: ChatMessage[] = [];
  const contacts: Array<{
    userId: string;
    name: string;
    role: "owner" | "caretaker";
    propertyId: string;
    property: string;
  }> = [];
  const refetch = vi.fn();
  const markThreadRead = vi.fn();
  const bumpThread = vi.fn();
  const openThread = vi.fn();
  const sendMessage = vi.fn();
  const startThread = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  return {
    threads,
    messages,
    contacts,
    refetch,
    markThreadRead,
    bumpThread,
    openThread,
    sendMessage,
    startThread,
    toast,
    useChatThreads: vi.fn(() => ({
      items: threads,
      loading: false,
      error: null,
      refetch,
      markThreadRead,
      bumpThread,
    })),
    useThreadMessages: vi.fn(() => ({
      messages,
      loading: false,
      error: null,
      appendMessage: (message: ChatMessage) => messages.push(message),
    })),
    useChatMutations: vi.fn(() => ({ sendMessage, openThread, startThread, pending: false })),
    useChatContacts: vi.fn(() => ({ items: contacts, loading: false, error: null, refetch })),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-chat", () => ({
  useChatThreads: mocks.useChatThreads,
  useThreadMessages: mocks.useThreadMessages,
  useChatMutations: mocks.useChatMutations,
  useChatContacts: mocks.useChatContacts,
}));

import { ChatInbox } from "@/components/chat/ChatInbox";

const thread: ChatThread = {
  _id: "thread-1",
  tenantId: "tenant-1",
  propertyId: "prop-1",
  ownerId: "owner-1",
  agentUserId: "owner-1",
  agentRole: "owner",
  contact: "Amina Otieno",
  role: "Tenant",
  property: "Sunset Villa",
  lastAt: "2026-09-02T09:00:00.000Z",
  lastMessageText: "Water tanks Thursday.",
  unread: 2,
};

const message: ChatMessage = {
  _id: "msg-1",
  threadId: "thread-1",
  senderUserId: "owner-1",
  senderRole: "owner",
  sender: "me",
  text: "On my way.",
  at: "2026-09-02T09:30:00.000Z",
};

describe("ChatInbox", () => {
  beforeEach(() => {
    mocks.threads.length = 0;
    mocks.messages.length = 0;
    mocks.contacts.length = 0;
    for (const fn of [
      mocks.refetch,
      mocks.markThreadRead,
      mocks.bumpThread,
      mocks.openThread,
      mocks.sendMessage,
      mocks.startThread,
    ]) {
      fn.mockReset();
    }
    mocks.toast.error.mockClear();
  });

  it("lists threads and opens one on click", async () => {
    mocks.threads.push(thread);
    const user = userEvent.setup();
    render(<ChatInbox />);

    await user.click(screen.getByRole("button", { name: /amina otieno/i }));

    expect(mocks.markThreadRead).toHaveBeenCalledWith("thread-1");
    expect(mocks.openThread).toHaveBeenCalledWith("thread-1");
  });

  it("sends a message in the selected thread", async () => {
    mocks.threads.push(thread);
    mocks.sendMessage.mockResolvedValue(message);
    const user = userEvent.setup();
    render(<ChatInbox />);

    await user.click(screen.getByRole("button", { name: /amina otieno/i }));
    await user.type(screen.getByPlaceholderText(/message amina otieno/i), "On my way.");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith("thread-1", "On my way."));
    expect(mocks.bumpThread).toHaveBeenCalled();
  });

  it("hides the new-conversation picker for staff by default", () => {
    render(<ChatInbox />);
    expect(screen.queryByRole("button", { name: /new conversation/i })).not.toBeInTheDocument();
  });

  it("starts a conversation from the tenant picker", async () => {
    mocks.contacts.push({
      userId: "owner-1",
      name: "Test Owner",
      role: "owner",
      propertyId: "prop-1",
      property: "Sunset Villa",
    });
    mocks.startThread.mockResolvedValue(thread);
    const user = userEvent.setup();
    render(<ChatInbox canStartConversation />);

    await user.click(screen.getByRole("button", { name: /new conversation/i }));
    await user.click(await screen.findByRole("button", { name: /test owner/i }));

    await waitFor(() =>
      expect(mocks.startThread).toHaveBeenCalledWith("owner-1", "owner", "prop-1"),
    );
    expect(mocks.refetch).toHaveBeenCalled();
  });
});
