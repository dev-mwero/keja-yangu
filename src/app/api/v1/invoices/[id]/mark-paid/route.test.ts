/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/notifications", () => ({
  notifyInvoicePaid: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { POST } from "@/app/api/v1/invoices/[id]/mark-paid/route";
import { notifyInvoicePaid } from "@/lib/notifications";

const { user, property, invoice: invoiceStub } = getModelStubs();
const notifyInvoicePaidMock = vi.mocked(notifyInvoicePaid);

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
const INVOICE_ID = makeObjectId("invoice");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc() {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: ["manage_invoices"],
  });
}

function pendingInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    status: "pending",
    amountDue: 25000,
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/v1/invoices/[id]/mark-paid", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyInvoicePaidMock.mockClear();
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid invoice id", async () => {
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVALID_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice id");
  });

  it("401 when unauthenticated", async () => {
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, { method: "POST", body: {} }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the invoice is missing", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("409 when the invoice is already paid", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "paid" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Invoice is already paid");
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("409 when the invoice is void", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "void" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Invoice is void");
  });

  it("400 for an invalid payment payload", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { method: "bitcoin" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid payment payload");
  });

  it("marks a pending invoice paid with full amount and owner audit stamps", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    const paid = { ...pendingInvoice(), status: "paid", amountPaid: 25000 };
    invoiceStub.findOneAndUpdate.mockReturnValue(buildQuery(paid));

    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: { method: "M-Pesa", notes: "paid via M-Pesa" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const [filter, updateData] = invoiceStub.findOneAndUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ _id: INVOICE_ID, status: { $in: ["pending", "draft"] } });
    expect(updateData.status).toBe("paid");
    expect(updateData.amountPaid).toBe(25000);
    expect(updateData.paidAt).toBeInstanceOf(Date);
    expect(updateData.paidBy).toBe(OWNER_ID);
    expect(updateData.paidByRole).toBe("owner");
    expect(updateData.method).toBe("M-Pesa");
    expect(updateData.notes).toBe("paid via M-Pesa");
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("paid");
    expect(notifyInvoicePaidMock).toHaveBeenCalledTimes(1);
    expect(notifyInvoicePaidMock).toHaveBeenCalledWith(
      expect.objectContaining({ _id: INVOICE_ID, status: "paid" }),
    );
  });

  it("marks a draft invoice paid", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "draft" })),
    );
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "paid" })),
    );

    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(OWNER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
  });

  it("an in-scope caretaker marks an attached invoice paid as caretaker", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...pendingInvoice(), status: "paid" }),
    );

    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const updateData = invoiceStub.findOneAndUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateData.paidBy).toBe(CARETAKER_ID);
    expect(updateData.paidByRole).toBe("caretaker");
  });

  it("403 when a caretaker marks an invoice outside their assigned properties", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: OTHER_PROPERTY_ID }]));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice())); // invoice on PROPERTY_ID
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
        method: "POST",
        token: signToken(CARETAKER_ID),
        body: {},
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest(`/api/v1/invoices/${INVOICE_ID}/mark-paid`, {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.13" },
          body: {},
        }),
        withParams(INVOICE_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
