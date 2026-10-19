"use client";

import Link from "next/link";
import { ChatInbox } from "@/components/chat/ChatInbox";

/** Tenant chat body — rendered inside the Messages tabs. */
export function TenantChatPanel() {
  return (
    <ChatInbox
      canStartConversation
      emptyHint="Messages with your caretaker and landlord appear here."
      footerNote={
        <>
          Need urgent help? Call your caretaker directly or report an issue from{" "}
          <Link href="/dashboard/tenant/home" className="text-primary hover:underline">
            My Home
          </Link>
          .
        </>
      }
    />
  );
}
