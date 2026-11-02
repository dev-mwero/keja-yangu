import { isValidObjectId } from "mongoose";
import type { PolicyResource } from "@/lib/authorization";
import { Application } from "@/models/Application";
import { ChatThread } from "@/models/ChatThread";
import { Complaint } from "@/models/Complaint";
import { Invoice } from "@/models/Invoice";
import { Lease } from "@/models/Lease";
import { MoveRequest } from "@/models/MoveRequest";
import { Payment } from "@/models/Payment";
import { Property } from "@/models/Property";
import { PropertyDocument } from "@/models/PropertyDocument";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";

export const POLICY_RESOURCE_KINDS = [
  "property",
  "block",
  "unit",
  "tenant",
  "application",
  "move-request",
  "lease",
  "invoice",
  "payment",
  "document",
  "complaint",
  "chat-thread",
] as const;
export type PolicyResourceKind = (typeof POLICY_RESOURCE_KINDS)[number];

export type ResourceLoadFailureReason = "invalid-id" | "not-found" | "inconsistent-parent";

export type ResourceLoadResult =
  | { ok: true; resource: PolicyResource }
  | { ok: false; reason: ResourceLoadFailureReason };

const invalidId: ResourceLoadResult = { ok: false, reason: "invalid-id" };
const notFound: ResourceLoadResult = { ok: false, reason: "not-found" };
const inconsistent: ResourceLoadResult = { ok: false, reason: "inconsistent-parent" };

function isRecordId(value: string | null | undefined): value is string {
  return Boolean(value) && isValidObjectId(value);
}

function ok(resource: PolicyResource): ResourceLoadResult {
  return { ok: true, resource };
}

function propertyResource(doc: {
  _id: unknown;
  lifecycleState?: PolicyResource["lifecycleState"];
}): ResourceLoadResult {
  return ok({
    propertyId: String(doc._id),
    lifecycleState: doc.lifecycleState,
  });
}

export async function loadPropertyResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const property = await Property.findById(id).select("_id lifecycleState").lean();
  if (!property) return notFound;
  return propertyResource(property);
}

export async function loadBlockResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const property = await Property.findOne({ "blocks._id": id }).select("_id lifecycleState").lean();
  if (!property) return notFound;
  return ok({
    propertyId: String(property._id),
    blockId: id,
    lifecycleState: property.lifecycleState,
  });
}

export async function loadUnitResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const unit = await Unit.findById(id).select("_id propertyId blockId").lean();
  if (!unit) return notFound;
  if (!isRecordId(unit.propertyId) || !isRecordId(unit.blockId)) {
    return inconsistent;
  }

  const property = await Property.findOne({
    _id: unit.propertyId,
    "blocks._id": unit.blockId,
  })
    .select("_id lifecycleState")
    .lean();
  if (!property) return inconsistent;

  return ok({
    propertyId: String(property._id),
    blockId: String(unit.blockId),
    unitId: String(unit._id),
    lifecycleState: property.lifecycleState,
  });
}

export async function loadTenantResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const tenant = await Tenant.findById(id).select("_id propertyId").lean();
  if (!tenant) return notFound;
  if (!isRecordId(tenant.propertyId)) return inconsistent;

  const lease = await Lease.findOne({ tenantId: String(tenant._id), status: "active" })
    .select("_id unitId propertyId")
    .lean();
  if (!lease?.unitId) return loadPropertyResource(tenant.propertyId);

  const unit = await loadUnitResource(lease.unitId);
  if (!unit.ok) return inconsistent;
  if (unit.resource.propertyId !== String(tenant.propertyId)) return inconsistent;
  return unit;
}

async function loadUnitOrProperty(input: {
  propertyId: string;
  unitId?: string;
}): Promise<ResourceLoadResult> {
  if (!isRecordId(input.propertyId)) return inconsistent;
  if (!input.unitId) return loadPropertyResource(input.propertyId);

  const unit = await loadUnitResource(input.unitId);
  if (!unit.ok) return inconsistent;
  if (unit.resource.propertyId !== String(input.propertyId)) return inconsistent;
  return unit;
}

export async function loadApplicationResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const application = await Application.findById(id).select("_id propertyId unitId").lean();
  if (!application) return notFound;
  return loadUnitOrProperty({
    propertyId: application.propertyId,
    unitId: application.unitId,
  });
}

export async function loadMoveRequestResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const moveRequest = await MoveRequest.findById(id).select("_id propertyId unitId").lean();
  if (!moveRequest) return notFound;
  return loadUnitOrProperty({
    propertyId: moveRequest.propertyId,
    unitId: moveRequest.unitId,
  });
}

export async function loadLeaseResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const lease = await Lease.findById(id).select("_id propertyId unitId").lean();
  if (!lease) return notFound;
  return loadUnitOrProperty({ propertyId: lease.propertyId, unitId: lease.unitId });
}

export async function loadInvoiceResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const invoice = await Invoice.findById(id).select("_id propertyId leaseId").lean();
  if (!invoice) return notFound;
  if (!isRecordId(invoice.propertyId)) return inconsistent;

  if (!invoice.leaseId) return loadPropertyResource(invoice.propertyId);

  const lease = await loadLeaseResource(invoice.leaseId);
  if (!lease.ok) return inconsistent;
  if (lease.resource.propertyId !== String(invoice.propertyId)) return inconsistent;
  return lease;
}

export async function loadPaymentResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const payment = await Payment.findById(id).select("_id invoiceId propertyId").lean();
  if (!payment) return notFound;
  if (!isRecordId(payment.invoiceId)) return inconsistent;

  const invoice = await loadInvoiceResource(payment.invoiceId);
  if (!invoice.ok) return inconsistent;
  if (invoice.resource.propertyId !== String(payment.propertyId)) return inconsistent;
  return invoice;
}

export async function loadDocumentResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const document = await PropertyDocument.findById(id).select("_id propertyId tenantId").lean();
  if (!document) return notFound;

  if (document.tenantId) {
    const tenant = await loadTenantResource(document.tenantId);
    if (!tenant.ok) return inconsistent;
    if (document.propertyId && tenant.resource.propertyId !== String(document.propertyId)) {
      return inconsistent;
    }
    return tenant;
  }

  if (!document.propertyId) return inconsistent;
  return loadPropertyResource(document.propertyId);
}

export async function loadComplaintResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const complaint = await Complaint.findById(id).select("_id propertyId unitId").lean();
  if (!complaint) return notFound;
  return loadUnitOrProperty({
    propertyId: complaint.propertyId,
    unitId: complaint.unitId,
  });
}

export async function loadChatThreadResource(id: string): Promise<ResourceLoadResult> {
  if (!isRecordId(id)) return invalidId;
  const thread = await ChatThread.findById(id).select("_id propertyId").lean();
  if (!thread) return notFound;
  return loadPropertyResource(thread.propertyId);
}

const LOADERS: Record<PolicyResourceKind, (id: string) => Promise<ResourceLoadResult>> = {
  property: loadPropertyResource,
  block: loadBlockResource,
  unit: loadUnitResource,
  tenant: loadTenantResource,
  application: loadApplicationResource,
  "move-request": loadMoveRequestResource,
  lease: loadLeaseResource,
  invoice: loadInvoiceResource,
  payment: loadPaymentResource,
  document: loadDocumentResource,
  complaint: loadComplaintResource,
  "chat-thread": loadChatThreadResource,
};

export function loadPolicyResource(
  kind: PolicyResourceKind,
  id: string,
): Promise<ResourceLoadResult> {
  return LOADERS[kind](id);
}
