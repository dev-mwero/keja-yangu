import type {
  AnnouncementAudience,
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
  DocumentCategory,
  DocumentScope,
  MessageSenderRole,
} from "@/lib/domain-enums";

/**
 * Serialized complaint from `/api/v1/complaints`. `property` is the denormalized
 * property title the tenant pages render; dates arrive as ISO strings via JSON.
 */
export interface Complaint {
  _id: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  subject: string;
  category: ComplaintCategory;
  message: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  resolution?: string;
  updatedById?: string;
  updatedByRole?: string;
  property: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Serialized chat message from `/api/v1/chat/threads/[id]/messages`. */
export interface ChatMessage {
  _id: string;
  threadId: string;
  senderUserId: string;
  senderRole: MessageSenderRole;
  sender: "me" | "them";
  text: string;
  at: string;
  createdAt?: string;
}

/** Serialized chat thread list item (summary fields only; no message history). */
export interface ChatThread {
  _id: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  agentUserId: string;
  agentRole: "owner" | "caretaker";
  contact: string;
  role: string;
  property: string;
  lastAt: string;
  lastMessageText: string;
  unread: number;
}

/** Serialized announcement from `/api/v1/announcements`. */
export interface Announcement {
  _id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  author: string;
  ownerId: string;
  propertyId: string;
  property: string;
  pinned: boolean;
  audience: AnnouncementAudience;
  createdAt?: string;
  updatedAt?: string;
}

/** Serialized document metadata row from `/api/v1/documents`. */
export interface DashboardDocument {
  _id: string;
  name: string;
  category: DocumentCategory;
  scope: DocumentScope;
  propertyId: string;
  tenantId: string;
  ownerId: string;
  uploadedById: string;
  uploadedByName: string;
  uploadedBy: string;
  size: string;
  uploadedAt: string;
  property: string;
  createdAt?: string;
  updatedAt?: string;
}
