import type { ApplicationStatus } from "@/lib/domain-enums";

export type { ApplicationStatus };

/** The shape the application UIs consume (mapped from the API document). */
export interface Application {
  id: string;
  propertyId: string;
  propertyTitle?: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
  message: string;
  status: ApplicationStatus;
  submittedAt: string;
  decidedAt?: string;
  decisionNote?: string;
}

/** The raw document returned by `GET /api/v1/applications`. */
export interface ApplicationDoc {
  _id: string;
  propertyId: string;
  propertyTitle?: string;
  applicantUserId: string;
  applicantName: string;
  applicantEmail: string;
  message?: string;
  status: ApplicationStatus;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export function toApplication(doc: ApplicationDoc): Application {
  return {
    id: doc._id,
    propertyId: doc.propertyId,
    propertyTitle: doc.propertyTitle,
    applicantUserId: doc.applicantUserId,
    applicantName: doc.applicantName,
    applicantEmail: doc.applicantEmail,
    message: doc.message ?? "",
    status: doc.status,
    submittedAt: doc.createdAt,
    decidedAt: doc.decidedAt,
    decisionNote: doc.decisionNote,
  };
}
