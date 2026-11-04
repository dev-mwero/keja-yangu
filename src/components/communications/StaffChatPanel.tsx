"use client";

import { ChatInbox } from "@/components/chat/ChatInbox";

/** Staff chat inbox — rendered inside the owner/caretaker Communications tabs. */
export function StaffChatPanel() {
  return <ChatInbox emptyHint="Messages from tenants appear here." />;
}
