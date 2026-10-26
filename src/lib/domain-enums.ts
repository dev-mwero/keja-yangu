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

export const MESSAGE_SENDER_ROLES = ["tenant", "owner", "caretaker", "custodian"] as const;
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

export const UNIT_STATUSES = ["available", "occupied", "maintenance"] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const MOVE_REQUEST_TYPES = ["move-in", "move-out"] as const;
export type MoveRequestType = (typeof MOVE_REQUEST_TYPES)[number];

export const MOVE_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type MoveRequestStatus = (typeof MOVE_REQUEST_STATUSES)[number];

export const APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_DECISION_STATUSES = ["approved", "rejected"] as const;
export type ApplicationDecisionStatus = (typeof APPLICATION_DECISION_STATUSES)[number];

export const PROPERTY_PURPOSES = ["residential", "commercial", "storage", "other"] as const;
export type PropertyPurpose = (typeof PROPERTY_PURPOSES)[number];
export const DEFAULT_PROPERTY_PURPOSE: PropertyPurpose = "residential";
