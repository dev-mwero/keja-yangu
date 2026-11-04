/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Application", () => ({ Application: getModelStubs().application }));
vi.mock("@/models/MoveRequest", () => ({ MoveRequest: getModelStubs().moverrequest }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/Payment", () => ({ Payment: getModelStubs().payment }));
vi.mock("@/models/Complaint", () => ({ Complaint: getModelStubs().complaint }));
vi.mock("@/models/ChatThread", () => ({ ChatThread: getModelStubs().chatthread }));
vi.mock("@/models/PropertyDocument", () => ({
  PropertyDocument: getModelStubs().propertydocument,
}));

import {
  loadApplicationResource,
  loadBlockResource,
  loadChatThreadResource,
  loadDocumentResource,
  loadInvoiceResource,
  loadPaymentResource,
  loadPolicyResource,
  loadPropertyResource,
  loadTenantResource,
  loadUnitResource,
} from "@/lib/policy-resources";

const models = getModelStubs();
const PROPERTY_ID = makeObjectId("property");
const BLOCK_ID = makeObjectId("block");
const UNIT_ID = makeObjectId("unit");
const TENANT_ID = makeObjectId("tenant");
const LEASE_ID = makeObjectId("lease");
const INVOICE_ID = makeObjectId("invoice");
const PAYMENT_ID = makeObjectId("payment");
const DOCUMENT_ID = makeObjectId("document");
const APPLICATION_ID = makeObjectId("application");
const THREAD_ID = makeObjectId("thread");

function propertyDoc(id = PROPERTY_ID) {
  return { _id: id, lifecycleState: "active" };
}

function unitDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: UNIT_ID,
    propertyId: PROPERTY_ID,
    blockId: BLOCK_ID,
    ...overrides,
  };
}

beforeEach(() => {
  resetModelStubs();
});

describe("resource id validation", () => {
  it("rejects invalid ids before querying", async () => {
    await expect(loadPropertyResource("not-an-id")).resolves.toEqual({
      ok: false,
      reason: "invalid-id",
    });
    expect(models.property.findById).not.toHaveBeenCalled();
  });

  it("returns not-found for a missing property", async () => {
    models.property.findById.mockReturnValue(buildQuery(null));
    await expect(loadPropertyResource(PROPERTY_ID)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("property and block resources", () => {
  it("loads a property with its lifecycle state", async () => {
    models.property.findById.mockReturnValue(buildQuery(propertyDoc()));
    await expect(loadPropertyResource(PROPERTY_ID)).resolves.toEqual({
      ok: true,
      resource: { propertyId: PROPERTY_ID, lifecycleState: "active" },
    });
  });

  it("resolves a block to its parent property", async () => {
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));
    await expect(loadBlockResource(BLOCK_ID)).resolves.toEqual({
      ok: true,
      resource: {
        propertyId: PROPERTY_ID,
        blockId: BLOCK_ID,
        lifecycleState: "active",
      },
    });
    expect(models.property.findOne).toHaveBeenCalledWith({ "blocks._id": BLOCK_ID });
  });

  it("rejects a block whose parent property is missing", async () => {
    models.property.findOne.mockReturnValue(buildQuery(null));
    await expect(loadBlockResource(BLOCK_ID)).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });
});

describe("unit resources", () => {
  it("loads a unit and verifies its property/block chain", async () => {
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));

    await expect(loadUnitResource(UNIT_ID)).resolves.toEqual({
      ok: true,
      resource: {
        propertyId: PROPERTY_ID,
        blockId: BLOCK_ID,
        unitId: UNIT_ID,
        lifecycleState: "active",
      },
    });
    expect(models.property.findOne).toHaveBeenCalledWith({
      _id: PROPERTY_ID,
      "blocks._id": BLOCK_ID,
    });
  });

  it("rejects a unit whose block does not belong to its property", async () => {
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(null));

    await expect(loadUnitResource(UNIT_ID)).resolves.toEqual({
      ok: false,
      reason: "inconsistent-parent",
    });
  });
});

describe("tenant resources", () => {
  it("uses the tenant's active lease unit", async () => {
    models.tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, propertyId: PROPERTY_ID }));
    models.lease.findOne.mockReturnValue(
      buildQuery({ _id: LEASE_ID, unitId: UNIT_ID, propertyId: PROPERTY_ID }),
    );
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));

    await expect(loadTenantResource(TENANT_ID)).resolves.toEqual({
      ok: true,
      resource: {
        propertyId: PROPERTY_ID,
        blockId: BLOCK_ID,
        unitId: UNIT_ID,
        lifecycleState: "active",
      },
    });
  });

  it("falls back to property scope without an active lease", async () => {
    models.tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, propertyId: PROPERTY_ID }));
    models.lease.findOne.mockReturnValue(buildQuery(null));
    models.property.findById.mockReturnValue(buildQuery(propertyDoc()));

    await expect(loadTenantResource(TENANT_ID)).resolves.toEqual({
      ok: true,
      resource: { propertyId: PROPERTY_ID, lifecycleState: "active" },
    });
  });

  it("rejects a lease unit from a different property", async () => {
    models.tenant.findById.mockReturnValue(
      buildQuery({ _id: TENANT_ID, propertyId: makeObjectId("other-property") }),
    );
    models.lease.findOne.mockReturnValue(
      buildQuery({ _id: LEASE_ID, unitId: UNIT_ID, propertyId: PROPERTY_ID }),
    );
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));

    await expect(loadTenantResource(TENANT_ID)).resolves.toEqual({
      ok: false,
      reason: "inconsistent-parent",
    });
  });
});

describe("derived resources", () => {
  it("resolves an application to its requested unit", async () => {
    models.application.findById.mockReturnValue(
      buildQuery({ _id: APPLICATION_ID, propertyId: PROPERTY_ID, unitId: UNIT_ID }),
    );
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));

    const result = await loadApplicationResource(APPLICATION_ID);
    expect(result).toMatchObject({ ok: true, resource: { unitId: UNIT_ID } });
  });

  it("rejects an application whose unit is outside its property", async () => {
    models.application.findById.mockReturnValue(
      buildQuery({
        _id: APPLICATION_ID,
        propertyId: makeObjectId("other-property"),
        unitId: UNIT_ID,
      }),
    );
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));

    await expect(loadApplicationResource(APPLICATION_ID)).resolves.toEqual({
      ok: false,
      reason: "inconsistent-parent",
    });
  });

  it("resolves an invoice through its lease", async () => {
    models.invoice.findById.mockReturnValue(
      buildQuery({ _id: INVOICE_ID, propertyId: PROPERTY_ID, leaseId: LEASE_ID }),
    );
    models.lease.findById.mockReturnValue(
      buildQuery({ _id: LEASE_ID, propertyId: PROPERTY_ID, unitId: UNIT_ID }),
    );
    models.unit.findById.mockReturnValue(buildQuery(unitDoc()));
    models.property.findOne.mockReturnValue(buildQuery(propertyDoc()));

    const result = await loadInvoiceResource(INVOICE_ID);
    expect(result).toMatchObject({ ok: true, resource: { unitId: UNIT_ID } });
  });

  it("rejects a payment whose invoice resolves to another property", async () => {
    models.payment.findById.mockReturnValue(
      buildQuery({ _id: PAYMENT_ID, invoiceId: INVOICE_ID, propertyId: PROPERTY_ID }),
    );
    models.invoice.findById.mockReturnValue(
      buildQuery({ _id: INVOICE_ID, propertyId: makeObjectId("other-property"), leaseId: "" }),
    );
    models.property.findById.mockReturnValue(
      buildQuery(propertyDoc(makeObjectId("other-property"))),
    );

    await expect(loadPaymentResource(PAYMENT_ID)).resolves.toEqual({
      ok: false,
      reason: "inconsistent-parent",
    });
  });

  it("resolves a tenant-scoped document through the tenant", async () => {
    models.propertydocument.findById.mockReturnValue(
      buildQuery({ _id: DOCUMENT_ID, propertyId: PROPERTY_ID, tenantId: TENANT_ID }),
    );
    models.tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, propertyId: PROPERTY_ID }));
    models.lease.findOne.mockReturnValue(buildQuery(null));
    models.property.findById.mockReturnValue(buildQuery(propertyDoc()));

    const result = await loadDocumentResource(DOCUMENT_ID);
    expect(result).toMatchObject({ ok: true, resource: { propertyId: PROPERTY_ID } });
  });

  it("resolves a chat thread to its property", async () => {
    models.chatthread.findById.mockReturnValue(
      buildQuery({ _id: THREAD_ID, propertyId: PROPERTY_ID }),
    );
    models.property.findById.mockReturnValue(buildQuery(propertyDoc()));

    const result = await loadChatThreadResource(THREAD_ID);
    expect(result).toMatchObject({ ok: true, resource: { propertyId: PROPERTY_ID } });
  });

  it("dispatches by resource kind", async () => {
    models.property.findById.mockReturnValue(buildQuery(propertyDoc()));
    await expect(loadPolicyResource("property", PROPERTY_ID)).resolves.toMatchObject({
      ok: true,
    });
  });
});
