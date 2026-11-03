import { describe, expect, it } from "vitest";
import { CommissionPayout } from "@/models/CommissionPayout";

describe("CommissionPayout schema", () => {
  it("initializes as a draft batch", () => {
    const doc = new CommissionPayout({
      batchCode: "pay_20261104_abc",
      brokerUserId: "broker-1",
      createdByUserId: "sys-1",
    });

    expect(doc.status).toBe("draft");
    expect(doc.accrualIds).toEqual([]);
    expect(doc.currency).toBe("KES");
    expect(doc.netMinor).toBe(0);
    expect(doc.approvedByUserId).toBe("");
    expect(doc.paidAt).toBeNull();
  });

  it("requires batch, broker and creator references", () => {
    const doc = new CommissionPayout({});
    const err = doc.validateSync();
    expect(err?.errors.batchCode).toBeDefined();
    expect(err?.errors.brokerUserId).toBeDefined();
    expect(err?.errors.createdByUserId).toBeDefined();
  });

  it("rejects unknown statuses", () => {
    const doc = new CommissionPayout({
      batchCode: "pay_1",
      brokerUserId: "broker-1",
      createdByUserId: "sys-1",
      status: "cancelled",
    });
    expect(doc.validateSync()?.errors.status).toBeDefined();
  });
});
