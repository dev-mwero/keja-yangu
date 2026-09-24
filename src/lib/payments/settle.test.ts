/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeInvoice, makeObjectId, makePayment } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/notifications", () => ({
  notifyInvoicePaid: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/models/Payment", () => ({ Payment: getModelStubs().payment }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { notifyInvoicePaid } from "@/lib/notifications";
import { applyProviderPayment } from "@/lib/payments/settle";

const { payment: paymentStub, invoice: invoiceStub } = getModelStubs();
const notifyInvoicePaidMock = vi.mocked(notifyInvoicePaid);

const INVOICE_ID = makeObjectId("invoice");
const PAYMENT_ID = makeObjectId("payment");
const TENANT_A = makeObjectId("tenant-a");

const input = {
  provider: "paystack" as const,
  providerReference: "KY-abc123-1a2b3c4d",
  amountMinor: 2500000,
  currency: "KES",
  channel: "card",
  paidAt: new Date("2026-09-20T12:00:00.000Z"),
  source: "webhook" as const,
};

function paymentDoc() {
  return makePayment({ _id: PAYMENT_ID, invoiceId: INVOICE_ID, tenantId: TENANT_A });
}

function pendingInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    tenantId: TENANT_A,
    status: "pending",
    amountDue: 25000,
    amountPaid: 0,
  });
}

function paidInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    tenantId: TENANT_A,
    status: "paid",
    amountDue: 25000,
    amountPaid: 25000,
    paidAt: new Date("2026-09-20T12:00:00.000Z"),
  });
}

describe("applyProviderPayment", () => {
  beforeEach(() => {
    resetModelStubs();
    notifyInvoicePaidMock.mockClear();
  });

  it("classifies an unknown reference without touching anything", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(null));

    const result = await applyProviderPayment(input);

    expect(result.outcome).toBe("unknown-reference");
    expect(paymentStub.updateOne).not.toHaveBeenCalled();
    expect(invoiceStub.findById).not.toHaveBeenCalled();
    expect(notifyInvoicePaidMock).not.toHaveBeenCalled();
  });

  it("classifies a missing invoice without touching anything", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));

    const result = await applyProviderPayment(input);

    expect(result.outcome).toBe("invoice-missing");
    expect(paymentStub.updateOne).not.toHaveBeenCalled();
  });

  it("settles a matching pending invoice and notifies exactly once", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    const paid = paidInvoice();
    invoiceStub.findOneAndUpdate.mockReturnValue(buildQuery(paid));
    paymentStub.updateOne.mockResolvedValue(undefined);

    const result = await applyProviderPayment(input);

    expect(result.outcome).toBe("settled");

    const [filter, updateData] = invoiceStub.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    const set = updateData.$set;
    expect(filter).toEqual({ _id: INVOICE_ID, status: { $in: ["pending", "draft"] } });
    expect(set.status).toBe("paid");
    expect(set.amountPaid).toBe(25000);
    expect(set.paidAt).toEqual(input.paidAt);
    expect(set.method).toBe("Card");
    expect(set.paidBy).toBe(TENANT_A);
    expect(set.paidByRole).toBe("tenant");
    expect(String(set.notes)).toContain("Paid via Paystack");

    expect(paymentStub.updateOne).toHaveBeenCalledWith(
      { _id: PAYMENT_ID },
      expect.objectContaining({ $set: expect.objectContaining({ status: "success" }) }),
    );
    expect(notifyInvoicePaidMock).toHaveBeenCalledTimes(1);
    expect(notifyInvoicePaidMock).toHaveBeenCalledWith(paid);
  });

  it("replays an already-paid invoice as a ledger catch-up without re-notifying", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(paidInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);

    const result = await applyProviderPayment(input);

    expect(result.outcome).toBe("already-settled");
    expect(paymentStub.updateOne).toHaveBeenCalledWith(
      { _id: PAYMENT_ID },
      expect.objectContaining({ $set: expect.objectContaining({ status: "success" }) }),
    );
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifyInvoicePaidMock).not.toHaveBeenCalled();
  });

  it("classifies a void invoice without writing anything", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, tenantId: TENANT_A, status: "void" })),
    );

    const result = await applyProviderPayment(input);

    expect(result.outcome).toBe("invoice-voided");
    expect(paymentStub.updateOne).not.toHaveBeenCalled();
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifyInvoicePaidMock).not.toHaveBeenCalled();
  });

  it("records an amount mismatch without settling the invoice", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);
    invoiceStub.updateOne.mockResolvedValue(undefined);

    const result = await applyProviderPayment({ ...input, amountMinor: 2400000 });

    expect(result.outcome).toBe("amount-mismatch");
    expect(paymentStub.updateOne).toHaveBeenCalledWith(
      { _id: PAYMENT_ID },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "success" }),
        $push: expect.objectContaining({ notes: expect.stringContaining("Amount mismatch") }),
      }),
    );
    expect(invoiceStub.updateOne).toHaveBeenCalledTimes(1);
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
    expect(notifyInvoicePaidMock).not.toHaveBeenCalled();
  });

  it("settles exactly once when a staff mark-paid and the webhook race", async () => {
    paymentStub.findOne.mockReturnValue(buildQuery(paymentDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    paymentStub.updateOne.mockResolvedValue(undefined);
    // First writer to the conditional update wins; the loser observes null.
    invoiceStub.findOneAndUpdate
      .mockReturnValueOnce(buildQuery(null))
      .mockReturnValueOnce(buildQuery(paidInvoice()));

    const results = await Promise.all([applyProviderPayment(input), applyProviderPayment(input)]);

    expect(results.map((r) => r.outcome).sort()).toEqual(["already-settled", "settled"]);
    expect(invoiceStub.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(paymentStub.updateOne).toHaveBeenCalledTimes(2);
    expect(notifyInvoicePaidMock).toHaveBeenCalledTimes(1);
  });
});
