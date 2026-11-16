/**
 * Counts unread messages per thread from a single batch of candidate messages.
 * Candidates are other-side messages in the page's threads; each message is
 * counted for its thread only when newer than that thread's read watermark
 * (`tenantLastReadAt` for tenants, `agentLastReadAt` otherwise). A null
 * watermark means nothing has been read yet, so every candidate counts.
 *
 * Pure helper so the batched logic is unit-testable without a database.
 */
export function countUnreadByThread(
  threads: readonly { _id: unknown; tenantLastReadAt?: Date; agentLastReadAt?: Date }[],
  viewerRole: ThreadViewerRole,
  messages: readonly { threadId: string; createdAt?: Date }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  const watermarks = new Map<string, Date | null>();
  for (const thread of threads) {
    const id = String(thread._id);
    const readAt = viewerRole === "tenant" ? thread.tenantLastReadAt : thread.agentLastReadAt;
    watermarks.set(id, readAt ?? null);
    counts.set(id, 0);
  }
  for (const message of messages) {
    const readAt = watermarks.get(message.threadId);
    if (readAt === undefined) continue;
    const createdAt = message.createdAt;
    if (readAt === null || (createdAt ? createdAt > readAt : false)) {
      counts.set(message.threadId, (counts.get(message.threadId) ?? 0) + 1);
    }
  }
  return counts;
}

export interface ThreadEnrichment {
  /** Display name of the agent side (owner user or caretaker user). */
  agentName: string;
  /** Display name of the tenant bound to the thread. */
  tenantName: string;
  /** Title of the thread's property ("" when unresolvable). */
  propertyTitle: string;
  /** Messages from the other side newer than the actor's last read. */
  unread: number;
}

export type ThreadViewerRole =
  | "tenant"
  | "owner"
  | "admin"
  | "caretaker"
  | "custodian"
  | "broker"
  | "system-admin";

/**
 * Copies a thread doc and appends the fields the chat pages render. Tenants see
 * the agent as the contact; staff see the tenant. `lastAt` is the last message
 * time as an ISO string, and `unread` is the per-participant count computed by
 * the route.
 */
export function serializeThread<
  T extends { _id: unknown; agentRole: string; lastMessageAt?: Date },
>(
  doc: T,
  enrichment: ThreadEnrichment,
  viewerRole: ThreadViewerRole,
): T & {
  _id: string;
  contact: string;
  role: string;
  property: string;
  lastAt: string;
  unread: number;
} {
  const staffView = viewerRole !== "tenant";
  return {
    ...doc,
    _id: String(doc._id),
    contact: staffView ? enrichment.tenantName : enrichment.agentName,
    role: staffView ? "Tenant" : doc.agentRole === "owner" ? "Landlord" : "Caretaker",
    property: enrichment.propertyTitle,
    lastAt: new Date(doc.lastMessageAt ?? new Date()).toISOString(),
    unread: enrichment.unread,
  };
}

/**
 * Copies a message doc and maps the two-participant view: `sender` is "me"
 * for the actor's own messages and "them" otherwise; `at` is the ISO timestamp.
 */
export function serializeMessage<
  T extends { _id: unknown; senderUserId: string; createdAt?: Date },
>(doc: T, userId: string): T & { _id: string; sender: "me" | "them"; at: string } {
  return {
    ...doc,
    _id: String(doc._id),
    sender: doc.senderUserId === userId ? "me" : "them",
    at: new Date(doc.createdAt ?? new Date()).toISOString(),
  };
}
