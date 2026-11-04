import { describe, expect, it } from "vitest";
import { CommissionAccrual } from "@/models/CommissionAccrual";

describe("CommissionAccrual schema", () => {
  it("initializes with safe shadow defaults", () => {
    const doc = new CommissionAccrual({
      brokerUserId: "broker-1",
      invoiceId: "inv-1",
    });

    expect(doc.kind).toBe("initial");
    expect(doc.status).toBe("pending");
    expect(doc.currency).toBe("KES");
    expect(doc.grossMinor).toBe(0);
    expect(doc.netMinor).toBe(0);
    expect(doc.payoutId).toBe("");
    expect(doc.approvedAt).toBeNull();
    expect(doc.paidAt).toBeNull();
  });

  it("requires broker and invoice references", () => {
    const doc = new CommissionAccrual({});
    const err = doc.validateSync();
    expect(err?.errors.brokerUserId).toBeDefined();
    expect(err?.errors.invoiceId).toBeDefined();
  });

  it("rejects unknown statuses and kinds", () => {
    const doc = new CommissionAccrual({
      brokerUserId: "broker-1",
      invoiceId: "inv-1",
      status: "settled",
      kind: "bonus",
    });
    const err = doc.validateSync();
    expect(err?.errors.status).toBeDefined();
    expect(err?.errors.kind).toBeDefined();
  });
});
