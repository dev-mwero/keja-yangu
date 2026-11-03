import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accrueCommissionForSettledInvoice,
  approveAccrual,
  computeCommission,
  createClawback,
  createPayoutBatch,
  executePayout,
  failPayout,
  reconcileCommissions,
  roundHalfUp,
} from "@/lib/commission";
import { buildQuery } from "@/test/utils/model-mocks";

const { attributionStub, accrualStub, payoutStub, agreementStub, writeAuditEventStub } = vi.hoisted(
  () => ({
    attributionStub: { findOne: vi.fn() },
    accrualStub: {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
      countDocuments: vi.fn(),
    },
    payoutStub: {
      find: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updateOne: vi.fn(),
      countDocuments: vi.fn(),
    },
    agreementStub: { findById: vi.fn() },
    writeAuditEventStub: vi.fn(),
  }),
);

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: writeAuditEventStub }));
vi.mock("@/models/Attribution", () => ({ Attribution: attributionStub }));
vi.mock("@/models/CommissionAccrual", () => ({ CommissionAccrual: accrualStub }));
vi.mock("@/models/CommissionPayout", () => ({ CommissionPayout: payoutStub }));
vi.mock("@/models/CommissionAgreement", () => ({ CommissionAgreement: agreementStub }));

describe("commission calculator", () => {
  it("rounds half-up at the final minor-unit step", () => {
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(4, 2)).toBe(2);
    expect(roundHalfUp(1, 3)).toBe(0);
  });

  it("computes a first-month commission only for the first rent invoice", () => {
    const agreement = { basis: "first_month_rent" as const, rateBps: 10_000, taxBps: 0 };
    const first = computeCommission({
      agreement,
      collectedRentMinor: 5_000_000,
      oneMonthRentMinor: 5_000_000,
      isFirstRentInvoice: true,
    });
    expect(first).toMatchObject({
      kind: "initial",
      basisMinor: 5_000_000,
      grossMinor: 5_000_000,
      netMinor: 5_000_000,
    });

    const later = computeCommission({
      agreement,
      collectedRentMinor: 5_000_000,
      oneMonthRentMinor: 5_000_000,
      isFirstRentInvoice: false,
    });
    expect(later).toBeNull();
  });

  it("computes percentage and fixed bases with tax", () => {
    const percentage = computeCommission({
      agreement: { basis: "percentage_of_rent", rateBps: 500, taxBps: 1_600 },
      collectedRentMinor: 3_000_000,
      oneMonthRentMinor: 3_000_000,
      isFirstRentInvoice: false,
    });
    expect(percentage).toMatchObject({
      kind: "recurring",
      basisMinor: 3_000_000,
      grossMinor: 150_000,
      taxMinor: 24_000,
      netMinor: 126_000,
    });

    const fixed = computeCommission({
      agreement: { basis: "fixed", fixedAmountMinor: 250_000, taxBps: 0 },
      collectedRentMinor: 0,
      oneMonthRentMinor: 0,
      isFirstRentInvoice: false,
    });
    expect(fixed).toMatchObject({ grossMinor: 250_000, netMinor: 250_000 });
  });

  it("returns null for a zero basis", () => {
    const result = computeCommission({
      agreement: { basis: "percentage_of_rent", rateBps: 500 },
      collectedRentMinor: 0,
      oneMonthRentMinor: 0,
      isFirstRentInvoice: false,
    });
    expect(result).toBeNull();
  });
});

describe("settlement accrual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditEventStub.mockResolvedValue(undefined);
  });

  it("creates a shadow accrual for a settled invoice", async () => {
    attributionStub.findOne.mockReturnValue(
      buildQuery({
        _id: "attr-1",
        status: "confirmed",
        brokerUserId: "broker-1",
        commissionAgreementId: "agr-1",
        propertyId: "prop-1",
        unitId: "unit-1",
      }),
    );
    agreementStub.findById.mockReturnValue(
      buildQuery({
        _id: "agr-1",
        basis: "percentage_of_rent",
        rateBps: 500,
        fixedAmountMinor: 0,
        currency: "KES",
      }),
    );
    accrualStub.countDocuments.mockResolvedValue(0);
    accrualStub.create.mockResolvedValue({ _id: "acc-1" });
    accrualStub.findById.mockReturnValue(
      buildQuery({ _id: "acc-1", brokerUserId: "broker-1", netMinor: 25_000 }),
    );

    const result = await accrueCommissionForSettledInvoice({
      _id: "inv-1",
      leaseId: "lease-1",
      rentAmount: 50_000,
      amountPaid: 50_000,
    });

    expect(result._id).toBe("acc-1");
    expect(accrualStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        attributionId: "attr-1",
        invoiceId: "inv-1",
        kind: "recurring",
        grossMinor: 250_000,
        netMinor: 250_000,
        status: "pending",
        metadata: { shadow: true },
      }),
    );
  });

  it("returns the existing accrual when a replay hits the unique key", async () => {
    attributionStub.findOne.mockReturnValue(
      buildQuery({
        _id: "attr-1",
        status: "confirmed",
        brokerUserId: "broker-1",
        commissionAgreementId: "agr-1",
      }),
    );
    agreementStub.findById.mockReturnValue(
      buildQuery({ _id: "agr-1", basis: "percentage_of_rent", rateBps: 500 }),
    );
    accrualStub.countDocuments.mockResolvedValue(0);
    accrualStub.create.mockRejectedValue({ code: 11000 });
    accrualStub.findOne.mockReturnValue(buildQuery({ _id: "acc-existing" }));

    const result = await accrueCommissionForSettledInvoice({
      _id: "inv-1",
      leaseId: "lease-1",
      rentAmount: 50_000,
    });

    expect(result._id).toBe("acc-existing");
  });

  it("does nothing when the lease has no confirmed attribution", async () => {
    attributionStub.findOne.mockReturnValue(buildQuery(null));
    const result = await accrueCommissionForSettledInvoice({
      _id: "inv-1",
      leaseId: "lease-1",
      rentAmount: 50_000,
    });
    expect(result).toBeNull();
    expect(accrualStub.create).not.toHaveBeenCalled();
  });
});

describe("commission lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writeAuditEventStub.mockResolvedValue(undefined);
  });

  it("rejects broker approval", async () => {
    await expect(approveAccrual({ userId: "broker-1", role: "broker" }, "acc-1")).rejects.toThrow(
      "Only administrators",
    );
  });

  it("approves an eligible accrual for an admin", async () => {
    accrualStub.findById
      .mockReturnValueOnce(
        buildQuery({
          _id: "acc-1",
          status: "eligible",
          propertyId: "prop-1",
          unitId: "unit-1",
        }),
      )
      .mockReturnValueOnce(buildQuery({ _id: "acc-1", status: "approved" }));
    accrualStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await approveAccrual({ userId: "admin-1", role: "admin" }, "acc-1");
    expect(result.status).toBe("approved");
    expect(accrualStub.updateOne).toHaveBeenCalledWith(
      { _id: "acc-1", status: "eligible" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "approved", approvedByUserId: "admin-1" }),
      }),
    );
  });

  it("creates an approved payout batch and freezes accruals", async () => {
    accrualStub.updateMany.mockResolvedValue({ modifiedCount: 0 });
    accrualStub.find.mockReturnValue(
      buildQuery([
        { _id: "acc-1", grossMinor: 10_000, taxMinor: 1_000, netMinor: 9_000, currency: "KES" },
        { _id: "acc-2", grossMinor: 5_000, taxMinor: 500, netMinor: 4_500, currency: "KES" },
      ]),
    );
    payoutStub.create.mockResolvedValue({ _id: "payout-1" });
    payoutStub.findById.mockReturnValue(
      buildQuery({
        _id: "payout-1",
        batchCode: "pay_x",
        accrualIds: ["acc-1", "acc-2"],
        status: "approved",
      }),
    );

    const payout = await createPayoutBatch({ userId: "sys-1", role: "system-admin" }, "broker-1");

    expect(payout.status).toBe("approved");
    expect(payoutStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        brokerUserId: "broker-1",
        grossMinor: 15_000,
        taxMinor: 1_500,
        netMinor: 13_500,
      }),
    );
  });

  it("blocks payout execution while shadow mode is disabled", async () => {
    vi.stubEnv("COMMISSION_PAYOUTS_ENABLED", "false");
    await expect(
      executePayout({ userId: "sys-1", role: "system-admin" }, "payout-1"),
    ).rejects.toThrow("disabled");
    vi.unstubAllEnvs();
  });

  it("executes a payout and marks accruals paid when enabled", async () => {
    vi.stubEnv("COMMISSION_PAYOUTS_ENABLED", "true");
    payoutStub.findById
      .mockReturnValueOnce(buildQuery({ _id: "payout-1", status: "approved" }))
      .mockReturnValueOnce(buildQuery({ _id: "payout-1", status: "paid" }));
    payoutStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    accrualStub.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const payout = await executePayout(
      { userId: "sys-1", role: "system-admin" },
      "payout-1",
      "MPESA-REF",
    );

    expect(payout.status).toBe("paid");
    expect(accrualStub.updateMany).toHaveBeenCalledWith(
      { payoutId: "payout-1", status: "approved" },
      expect.objectContaining({ $set: expect.objectContaining({ status: "paid" }) }),
    );
    vi.unstubAllEnvs();
  });

  it("restores accruals to approved when a payout fails", async () => {
    payoutStub.findById
      .mockReturnValueOnce(buildQuery({ _id: "payout-1", status: "approved" }))
      .mockReturnValueOnce(buildQuery({ _id: "payout-1", status: "failed" }));
    payoutStub.updateOne.mockResolvedValue({ modifiedCount: 1 });
    accrualStub.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const payout = await failPayout(
      { userId: "sys-1", role: "system-admin" },
      "payout-1",
      "Provider rejected",
    );

    expect(payout.status).toBe("failed");
    expect(accrualStub.updateMany).toHaveBeenCalledWith(
      { payoutId: "payout-1", status: "approved" },
      expect.objectContaining({ $set: { status: "approved", payoutId: "" } }),
    );
  });

  it("reverses an unpaid accrual", async () => {
    accrualStub.findById
      .mockReturnValueOnce(
        buildQuery({ _id: "acc-1", status: "approved", kind: "initial", netMinor: 10_000 }),
      )
      .mockReturnValueOnce(buildQuery({ _id: "acc-1", status: "reversed" }));
    accrualStub.updateOne.mockResolvedValue({ modifiedCount: 1 });

    const result = await createClawback(
      { userId: "sys-1", role: "system-admin" },
      "acc-1",
      "Tenant refunded",
    );

    expect(result.status).toBe("reversed");
    expect(accrualStub.updateOne).toHaveBeenCalledWith(
      { _id: "acc-1" },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "reversed", reversalReason: "Tenant refunded" }),
      }),
    );
    expect(accrualStub.create).not.toHaveBeenCalled();
  });

  it("reconciles paid accruals against paid payout batches", async () => {
    accrualStub.find
      .mockReturnValueOnce(buildQuery([{ _id: "acc-1", payoutId: "payout-1" }]))
      .mockReturnValueOnce(
        buildQuery([
          { _id: "acc-1", attributionId: "attr-1", invoiceId: "inv-1", kind: "initial" },
        ]),
      );
    payoutStub.find.mockReturnValue(buildQuery([{ _id: "payout-1", status: "paid" }]));

    const report = await reconcileCommissions();

    expect(report.ok).toBe(true);
    expect(report.paidWithoutBatch).toHaveLength(0);
    expect(report.duplicateAccruals).toHaveLength(0);
  });

  it("flags duplicate accruals for the same invoice", async () => {
    accrualStub.find
      .mockReturnValueOnce(buildQuery([]))
      .mockReturnValueOnce(
        buildQuery([
          { _id: "acc-1", attributionId: "attr-1", invoiceId: "inv-1", kind: "initial" },
          { _id: "acc-2", attributionId: "attr-1", invoiceId: "inv-1", kind: "initial" },
        ]),
      );
    payoutStub.find.mockReturnValue(buildQuery([]));

    const report = await reconcileCommissions();

    expect(report.ok).toBe(false);
    expect(report.duplicateAccruals).toHaveLength(1);
    expect(report.duplicateAccruals[0].accrualIds).toEqual(["acc-1", "acc-2"]);
  });

  it("appends a negative clawback for an already-paid accrual", async () => {
    accrualStub.findById
      .mockReturnValueOnce(
        buildQuery({
          _id: "acc-1",
          status: "paid",
          kind: "initial",
          netMinor: 10_000,
          invoiceId: "inv-1",
          brokerUserId: "broker-1",
        }),
      )
      .mockReturnValueOnce(buildQuery({ _id: "acc-claw", status: "eligible" }));
    accrualStub.create.mockResolvedValue({ _id: "acc-claw" });

    const result = await createClawback(
      { userId: "sys-1", role: "system-admin" },
      "acc-1",
      "Paid tenancy cancelled",
    );

    expect(result.status).toBe("eligible");
    expect(accrualStub.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "clawback",
        netMinor: -10_000,
        grossMinor: -10_000,
      }),
    );
  });
});
