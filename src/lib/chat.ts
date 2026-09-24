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

/**
 * Copies a thread doc and appends the fields the chat pages render:
 * `contact`/`role` come from the agent snapshot plus the batched user lookup,
 * `lastAt` is the last message time as an ISO string, and `unread` is the
 * per-participant count computed by the route.
 */
export function serializeThread<
  T extends { _id: unknown; agentRole: string; lastMessageAt?: Date },
>(
  doc: T,
  enrichment: ThreadEnrichment,
): T & {
  _id: string;
  contact: string;
  role: string;
  property: string;
  lastAt: string;
  unread: number;
} {
  return {
    ...doc,
    _id: String(doc._id),
    contact: enrichment.agentName,
    role: doc.agentRole === "owner" ? "Landlord" : "Caretaker",
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
