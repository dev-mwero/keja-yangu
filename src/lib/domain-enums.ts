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

export const LEAD_STATUSES = ["new", "contacted", "approved", "rejected", "converted"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ASSIGNMENT_ACCESS_ROLES = ["admin", "custodian", "caretaker"] as const;
export type AssignmentAccessRole = (typeof ASSIGNMENT_ACCESS_ROLES)[number];

export const ASSIGNMENT_SCOPE_TYPES = ["property", "block", "unit"] as const;
export type AssignmentScopeType = (typeof ASSIGNMENT_SCOPE_TYPES)[number];

export const ASSIGNMENT_STATUSES = [
  "pending",
  "active",
  "suspended",
  "revoked",
  "expired",
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_SOURCES = ["invitation", "claim", "migration", "system"] as const;
export type AssignmentSource = (typeof ASSIGNMENT_SOURCES)[number];

export const OWNERSHIP_HOLDER_TYPES = ["user", "external"] as const;
export type OwnershipHolderType = (typeof OWNERSHIP_HOLDER_TYPES)[number];

export const OWNERSHIP_STATUSES = ["active", "ended", "disputed"] as const;
export type OwnershipStatus = (typeof OWNERSHIP_STATUSES)[number];

export const PROPERTY_CLAIM_STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
export type PropertyClaimStatus = (typeof PROPERTY_CLAIM_STATUSES)[number];

export const PROPERTY_LIFECYCLE_STATES = ["active", "decommissioned", "merged"] as const;
export type PropertyLifecycleState = (typeof PROPERTY_LIFECYCLE_STATES)[number];

export const BILLING_ACCOUNT_STATUSES = ["active", "suspended", "closed"] as const;
export type BillingAccountStatus = (typeof BILLING_ACCOUNT_STATUSES)[number];

export const UNIT_BILLING_ASSIGNMENT_STATUSES = [
  "active",
  "scheduled",
  "ended",
  "disputed",
] as const;
export type UnitBillingAssignmentStatus = (typeof UNIT_BILLING_ASSIGNMENT_STATUSES)[number];

export const LISTING_STATES = [
  "draft",
  "active",
  "paused",
  "let",
  "expired",
  "withdrawn",
] as const;
export type ListingState = (typeof LISTING_STATES)[number];

export const LISTING_VISIBILITIES = ["public", "unlisted"] as const;
export type ListingVisibility = (typeof LISTING_VISIBILITIES)[number];

export const LISTING_PUBLISHER_ROLES = ["admin", "broker"] as const;
export type ListingPublisherRole = (typeof LISTING_PUBLISHER_ROLES)[number];

export const LISTING_PUBLISHER_STATES = [
  "active",
  "paused",
  "revoked",
  "expired",
] as const;
export type ListingPublisherState = (typeof LISTING_PUBLISHER_STATES)[number];
