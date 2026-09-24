export const COMPLAINT_CATEGORIES = [
  "Maintenance",
  "Noise",
  "Billing",
  "Security",
  "Neighbours",
  "Other",
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_STATUSES = ["open", "in-progress", "resolved"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_PRIORITIES = ["low", "medium", "high"] as const;
export type ComplaintPriority = (typeof COMPLAINT_PRIORITIES)[number];

export const MESSAGE_SENDER_ROLES = ["tenant", "owner", "caretaker"] as const;
export type MessageSenderRole = (typeof MESSAGE_SENDER_ROLES)[number];

export const ANNOUNCEMENT_AUDIENCES = ["all", "tenants", "staff"] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const DOCUMENT_CATEGORIES = [
  "lease",
  "invoice",
  "utility",
  "notice",
  "inspection",
  "policy",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_SCOPES = ["tenant", "landlord", "property"] as const;
export type DocumentScope = (typeof DOCUMENT_SCOPES)[number];
