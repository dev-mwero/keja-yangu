import { randomBytes } from "node:crypto";
import { writeAuditEvent } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import type {
  BrokerAuthStatus,
  BrokerScopeType,
  CommissionAgreementStatus,
  CommissionBasis,
} from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import type { Role } from "@/lib/permissions";
import { BrokerAuthorization } from "@/models/BrokerAuthorization";
import { BrokerProfile } from "@/models/BrokerProfile";
import { CommissionAgreement } from "@/models/CommissionAgreement";
import { Listing } from "@/models/Listing";
import { ListingPublisher } from "@/models/ListingPublisher";

export interface UpsertBrokerProfileInput {
  agencyName?: string;
  licenseNumber?: string;
  phone: string;
  email: string;
  counties?: string[];
  specialties?: string[];
  payoutMethod?: {
    payoutType: "mpesa" | "bank" | "none";
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
  };
}

export async function getBrokerProfile(userId: string) {
  await connectToDatabase();
  return (await BrokerProfile.findOne({ userId }).lean()) as any;
}

export async function upsertBrokerProfile(userId: string, input: UpsertBrokerProfileInput) {
  await connectToDatabase();

  const existing = (await BrokerProfile.findOne({ userId }).lean()) as any;

  if (existing) {
    const updateData: Record<string, any> = {
      agencyName: input.agencyName ?? existing.agencyName,
      licenseNumber: input.licenseNumber ?? existing.licenseNumber,
      phone: input.phone || existing.phone,
      email: input.email || existing.email,
      counties: input.counties ?? existing.counties,
      specialties: input.specialties ?? existing.specialties,
      payoutMethod: input.payoutMethod ?? existing.payoutMethod,
    };

    // If previously rejected, re-submitting allows re-verification
    if (existing.status === "rejected") {
      updateData.status = "pending";
    }

    await BrokerProfile.updateOne({ userId }, { $set: updateData });
    const updated = (await BrokerProfile.findOne({ userId }).lean()) as any;

    await writeAuditEvent({
      actor: { userId, role: "broker" },
      action: "broker.profile_updated",
      entityType: "broker_profile",
      entityId: String(updated._id),
      before: existing,
      after: updated,
    });

    return updated;
  }

  const created = await BrokerProfile.create({
    userId,
    agencyName: input.agencyName || "",
    licenseNumber: input.licenseNumber || "",
    phone: input.phone,
    email: input.email.toLowerCase().trim(),
    counties: input.counties || [],
    specialties: input.specialties || [],
    payoutMethod: input.payoutMethod || { payoutType: "none" },
    status: "pending",
  });

  const createdDoc = (await BrokerProfile.findById(created._id).lean()) as any;

  await writeAuditEvent({
    actor: { userId, role: "broker" },
    action: "broker.profile_created",
    entityType: "broker_profile",
    entityId: String(createdDoc._id),
    after: createdDoc,
  });

  return createdDoc;
}

export async function verifyBrokerProfile(
  profileId: string,
  reviewer: { userId: string; role: Role },
  decision: "verified" | "rejected" | "suspended",
  notes?: string,
) {
  await connectToDatabase();

  if (reviewer.role !== "system-admin") {
    throw new Error("Only system administrators can verify or suspend broker profiles");
  }

  const profile = (await BrokerProfile.findById(profileId).lean()) as any;
  if (!profile) {
    throw new Error("Broker profile not found");
  }

  const updateFields: Record<string, any> = {
    status: decision,
    verificationNotes: notes ?? profile.verificationNotes ?? "",
  };

  if (decision === "verified") {
    updateFields.verifiedByUserId = reviewer.userId;
    updateFields.verifiedAt = new Date();
  } else if (decision === "suspended") {
    updateFields.suspendedByUserId = reviewer.userId;
    updateFields.suspendedAt = new Date();
    updateFields.suspensionReason = notes || "";
  }

  await BrokerProfile.updateOne({ _id: profileId }, { $set: updateFields });
  const updated = (await BrokerProfile.findById(profileId).lean()) as any;

  // If suspended or rejected, also cascade suspend active broker publishers
  if (decision === "suspended" || decision === "rejected") {
    await ListingPublisher.updateMany(
      {
        publisherUserId: profile.userId,
        publisherRole: "broker",
        state: "active",
      },
      {
        $set: {
          state: "revoked",
          revokedByUserId: reviewer.userId,
          revokedAt: new Date(),
        },
      },
    );
  }

  await writeAuditEvent({
    actor: { userId: reviewer.userId, role: reviewer.role },
    action: `broker.profile_${decision}`,
    entityType: "broker_profile",
    entityId: profileId,
    before: { status: profile.status },
    after: { status: decision, notes },
  });

  return updated;
}

export interface AuthorizeBrokerInput {
  brokerId: string;
  scopeType: BrokerScopeType;
  scopeId: string;
  propertyId: string;
  validTo?: Date | null;
  notes?: string;
}

export async function authorizeBroker(
  adminActor: { userId: string; role: Role },
  input: AuthorizeBrokerInput,
) {
  await connectToDatabase();

  const brokerProfile = (await BrokerProfile.findOne({
    userId: input.brokerId,
  }).lean()) as any;

  if (!brokerProfile || brokerProfile.status !== "verified") {
    throw new Error("Cannot authorize unverified or nonexistent broker");
  }

  if (adminActor.role !== "system-admin") {
    const authRes = await authorize(adminActor.userId, "broker:authorize", {
      propertyId: input.propertyId,
      unitId: input.scopeType === "unit" ? input.scopeId : undefined,
      blockId: input.scopeType === "block" ? input.scopeId : undefined,
    });

    if (!authRes.allowed) {
      throw new Error(`Unauthorized to grant broker authorization: ${authRes.reason}`);
    }
  }

  // Check if active authorization already exists
  const existing = (await BrokerAuthorization.findOne({
    brokerId: input.brokerId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    status: "active",
  }).lean()) as any;

  if (existing) {
    return existing;
  }

  const created = await BrokerAuthorization.create({
    brokerId: input.brokerId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    propertyId: input.propertyId,
    status: "active",
    grantedByUserId: adminActor.userId,
    grantedAt: new Date(),
    validFrom: new Date(),
    validTo: input.validTo || null,
    notes: input.notes || "",
  });

  const createdDoc = (await BrokerAuthorization.findById(created._id).lean()) as any;

  await writeAuditEvent({
    actor: { userId: adminActor.userId, role: adminActor.role },
    action: "broker.authorization_granted",
    entityType: "broker_authorization",
    entityId: String(createdDoc._id),
    scope: {
      propertyId: input.propertyId,
      unitId: input.scopeType === "unit" ? input.scopeId : undefined,
      blockId: input.scopeType === "block" ? input.scopeId : undefined,
    },
    after: createdDoc,
  });

  return createdDoc;
}

export async function revokeBrokerAuthorization(
  adminActor: { userId: string; role: Role },
  authId: string,
  reason?: string,
) {
  await connectToDatabase();

  const auth = (await BrokerAuthorization.findById(authId).lean()) as any;
  if (!auth) {
    throw new Error("Broker authorization not found");
  }

  if (adminActor.role !== "system-admin") {
    const authRes = await authorize(adminActor.userId, "broker:revoke", {
      propertyId: auth.propertyId,
      unitId: auth.scopeType === "unit" ? auth.scopeId : undefined,
      blockId: auth.scopeType === "block" ? auth.scopeId : undefined,
    });

    if (!authRes.allowed) {
      throw new Error(`Unauthorized to revoke broker authorization: ${authRes.reason}`);
    }
  }

  await BrokerAuthorization.updateOne(
    { _id: authId },
    {
      $set: {
        status: "revoked",
        revokedByUserId: adminActor.userId,
        revokedAt: new Date(),
        revocationReason: reason || "",
      },
    },
  );

  const updated = (await BrokerAuthorization.findById(authId).lean()) as any;

  // Cascade revoke broker publishers linked to this authorization
  await ListingPublisher.updateMany(
    {
      brokerAuthorizationId: authId,
      state: "active",
    },
    {
      $set: {
        state: "revoked",
        revokedByUserId: adminActor.userId,
        revokedAt: new Date(),
      },
    },
  );

  await writeAuditEvent({
    actor: { userId: adminActor.userId, role: adminActor.role },
    action: "broker.authorization_revoked",
    entityType: "broker_authorization",
    entityId: authId,
    scope: {
      propertyId: auth.propertyId,
      unitId: auth.scopeType === "unit" ? auth.scopeId : undefined,
      blockId: auth.scopeType === "block" ? auth.scopeId : undefined,
    },
    before: { status: auth.status },
    after: { status: "revoked", reason },
  });

  return updated;
}

export async function listBrokerAuthorizations(filter: {
  brokerId?: string;
  propertyId?: string;
  status?: BrokerAuthStatus;
}) {
  await connectToDatabase();
  const query: Record<string, any> = {};
  if (filter.brokerId) query.brokerId = filter.brokerId;
  if (filter.propertyId) query.propertyId = filter.propertyId;
  if (filter.status) query.status = filter.status;

  return (await BrokerAuthorization.find(query).sort({ createdAt: -1 }).lean()) as any[];
}

export interface CommissionAgreementInput {
  brokerId: string;
  scopeType: BrokerScopeType;
  scopeId: string;
  propertyId: string;
  basis?: CommissionBasis;
  rateBps?: number;
  fixedAmountMinor?: number;
  currency?: string;
  payerBillingAccountId?: string;
  autoActivate?: boolean;
}

export async function createCommissionAgreement(
  adminActor: { userId: string; role: Role },
  input: CommissionAgreementInput,
) {
  await connectToDatabase();

  if (adminActor.role !== "system-admin") {
    const authRes = await authorize(adminActor.userId, "broker:agreement:manage", {
      propertyId: input.propertyId,
      unitId: input.scopeType === "unit" ? input.scopeId : undefined,
      blockId: input.scopeType === "block" ? input.scopeId : undefined,
    });

    if (!authRes.allowed) {
      throw new Error(`Unauthorized to create commission agreement: ${authRes.reason}`);
    }
  }

  const initialStatus: CommissionAgreementStatus = input.autoActivate ? "active" : "draft";

  const created = await CommissionAgreement.create({
    brokerId: input.brokerId,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    propertyId: input.propertyId,
    basis: input.basis || "first_month_rent",
    rateBps: input.rateBps ?? 0,
    fixedAmountMinor: input.fixedAmountMinor ?? 0,
    currency: input.currency || "KES",
    status: initialStatus,
    payerBillingAccountId: input.payerBillingAccountId || "",
    termsAcceptedByBrokerAt: input.autoActivate ? new Date() : null,
    createdByUserId: adminActor.userId,
  });

  const createdDoc = (await CommissionAgreement.findById(created._id).lean()) as any;

  await writeAuditEvent({
    actor: { userId: adminActor.userId, role: adminActor.role },
    action: "broker.agreement_created",
    entityType: "commission_agreement",
    entityId: String(createdDoc._id),
    scope: {
      propertyId: input.propertyId,
      unitId: input.scopeType === "unit" ? input.scopeId : undefined,
      blockId: input.scopeType === "block" ? input.scopeId : undefined,
    },
    after: createdDoc,
  });

  return createdDoc;
}

export async function acceptCommissionAgreement(brokerUserId: string, agreementId: string) {
  await connectToDatabase();

  const agreement = (await CommissionAgreement.findById(agreementId).lean()) as any;
  if (!agreement) {
    throw new Error("Commission agreement not found");
  }

  if (agreement.brokerId !== brokerUserId) {
    throw new Error("Agreement does not belong to this broker");
  }

  if (agreement.status !== "draft") {
    throw new Error(`Cannot accept agreement in status '${agreement.status}'`);
  }

  await CommissionAgreement.updateOne(
    { _id: agreementId },
    {
      $set: {
        status: "active",
        termsAcceptedByBrokerAt: new Date(),
      },
    },
  );

  const updated = (await CommissionAgreement.findById(agreementId).lean()) as any;

  await writeAuditEvent({
    actor: { userId: brokerUserId, role: "broker" },
    action: "broker.agreement_accepted",
    entityType: "commission_agreement",
    entityId: agreementId,
    before: { status: agreement.status },
    after: { status: "active", acceptedAt: updated.termsAcceptedByBrokerAt },
  });

  return updated;
}

export async function terminateCommissionAgreement(
  adminActor: { userId: string; role: Role },
  agreementId: string,
  reason?: string,
) {
  await connectToDatabase();

  const agreement = (await CommissionAgreement.findById(agreementId).lean()) as any;
  if (!agreement) {
    throw new Error("Commission agreement not found");
  }

  if (adminActor.role !== "system-admin") {
    const authRes = await authorize(adminActor.userId, "broker:agreement:manage", {
      propertyId: agreement.propertyId,
      unitId: agreement.scopeType === "unit" ? agreement.scopeId : undefined,
      blockId: agreement.scopeType === "block" ? agreement.scopeId : undefined,
    });

    if (!authRes.allowed) {
      throw new Error(`Unauthorized to terminate commission agreement: ${authRes.reason}`);
    }
  }

  await CommissionAgreement.updateOne(
    { _id: agreementId },
    {
      $set: {
        status: "terminated",
        terminatedByUserId: adminActor.userId,
        terminatedAt: new Date(),
        terminationReason: reason || "",
      },
    },
  );

  const updated = (await CommissionAgreement.findById(agreementId).lean()) as any;

  await writeAuditEvent({
    actor: { userId: adminActor.userId, role: adminActor.role },
    action: "broker.agreement_terminated",
    entityType: "commission_agreement",
    entityId: agreementId,
    before: { status: agreement.status },
    after: { status: "terminated", reason },
  });

  return updated;
}

export async function canBrokerDistributeListing(
  brokerUserId: string,
  listingId: string,
): Promise<{
  eligible: boolean;
  reason?: string;
  authorization?: any;
  agreement?: any;
  listing?: any;
}> {
  await connectToDatabase();

  const profile = (await BrokerProfile.findOne({ userId: brokerUserId }).lean()) as any;
  if (!profile || profile.status !== "verified") {
    return { eligible: false, reason: "Broker profile is not verified" };
  }

  const listing = (await Listing.findById(listingId).lean()) as any;
  if (!listing || listing.state !== "active" || listing.deletedAt) {
    return { eligible: false, reason: "Listing is not active or does not exist" };
  }

  // Find matching active authorization across unit, block, or property scope
  const scopes = [
    { scopeType: "unit", scopeId: listing.unitId },
    ...(listing.blockId ? [{ scopeType: "block", scopeId: listing.blockId }] : []),
    { scopeType: "property", scopeId: listing.propertyId },
  ];

  const authorization = (await BrokerAuthorization.findOne({
    brokerId: brokerUserId,
    status: "active",
    $or: scopes,
  }).lean()) as any;

  if (!authorization) {
    return {
      eligible: false,
      reason: "Broker has no active authorization for this listing's scope",
      listing,
    };
  }

  // Check validTo expiry on authorization if present
  if (authorization.validTo && new Date(authorization.validTo) < new Date()) {
    return { eligible: false, reason: "Broker authorization has expired", listing };
  }

  // Find matching active commission agreement across unit, block, or property scope
  const agreement = (await CommissionAgreement.findOne({
    brokerId: brokerUserId,
    status: "active",
    $or: scopes,
  }).lean()) as any;

  if (!agreement) {
    return {
      eligible: false,
      reason: "Broker has no active commission agreement for this listing's scope",
      authorization,
      listing,
    };
  }

  return {
    eligible: true,
    authorization,
    agreement,
    listing,
  };
}

export async function createBrokerListingPublisher(brokerUserId: string, listingId: string) {
  await connectToDatabase();

  const check = await canBrokerDistributeListing(brokerUserId, listingId);
  if (!check.eligible) {
    throw new Error(`Cannot create publisher: ${check.reason}`);
  }

  // Check if active publisher already exists for this broker and listing
  const existing = (await ListingPublisher.findOne({
    listingId,
    publisherUserId: brokerUserId,
    publisherRole: "broker",
    state: "active",
  }).lean()) as any;

  if (existing) {
    return existing;
  }

  const shareCode = `brk_${randomBytes(4).toString("hex")}`;

  const publisher = await ListingPublisher.create({
    listingId,
    publisherUserId: brokerUserId,
    publisherRole: "broker",
    brokerAuthorizationId: String(check.authorization._id),
    shareCode,
    state: "active",
    createdByUserId: brokerUserId,
  });

  const publisherDoc = (await ListingPublisher.findById(publisher._id).lean()) as any;

  await writeAuditEvent({
    actor: { userId: brokerUserId, role: "broker" },
    action: "broker.publisher_created",
    entityType: "listing_publisher",
    entityId: String(publisherDoc._id),
    scope: {
      propertyId: check.listing.propertyId,
      blockId: check.listing.blockId,
      unitId: check.listing.unitId,
    },
    after: { shareCode, brokerAuthorizationId: String(check.authorization._id) },
  });

  return publisherDoc;
}

export interface RedactedProspectView {
  id: string;
  referenceCode: string;
  unitHeadline: string;
  appliedAt: string | Date;
  status: string;
}

export function toRedactedProspectView(doc: {
  _id?: unknown;
  id?: string;
  createdAt?: Date | string;
  appliedAt?: Date | string;
  status?: string;
  unitHeadline?: string;
  headline?: string;
}): RedactedProspectView {
  const idStr = String(doc._id || doc.id || "");
  const refCode = idStr ? `REF-${idStr.slice(-6).toUpperCase()}` : "REF-UNKNOWN";

  return {
    id: idStr,
    referenceCode: refCode,
    unitHeadline: doc.unitHeadline || doc.headline || "Unit Application",
    appliedAt: doc.appliedAt || doc.createdAt || new Date(),
    status: doc.status || "pending",
  };
}
