import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileAttributions } from "@/lib/attribution-reconciliation";
import { buildQuery } from "@/test/utils/model-mocks";

const { attributionStub, leaseStub } = vi.hoisted(() => ({
  attributionStub: {
    find: vi.fn(),
  },
  leaseStub: {
    find: vi.fn(),
  },
}));

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/Attribution", () => ({
  Attribution: attributionStub,
}));
vi.mock("@/models/Lease", () => ({
  Lease: leaseStub,
}));

describe("attribution reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports ok when all confirmed attributions cleanly map 1-to-1 to existing leases", async () => {
    attributionStub.find.mockReturnValue(
      buildQuery([
        { _id: "attr-1", leaseId: "lease-1", status: "confirmed" },
        { _id: "attr-2", leaseId: "lease-2", status: "confirmed" },
      ]),
    );

    leaseStub.find.mockReturnValue(buildQuery([{ _id: "lease-1" }, { _id: "lease-2" }]));

    const res = await reconcileAttributions();
    expect(res.ok).toBe(true);
    expect(res.orphanConfirmedAttributions).toHaveLength(0);
    expect(res.duplicateLeaseAttributions).toHaveLength(0);
    expect(res.totalConfirmed).toBe(2);
  });

  it("detects orphan attributions with non-existent lease IDs", async () => {
    attributionStub.find.mockReturnValue(
      buildQuery([
        { _id: "attr-1", leaseId: "lease-1", status: "confirmed" },
        { _id: "attr-2", leaseId: "ghost-lease", status: "confirmed" },
      ]),
    );

    leaseStub.find.mockReturnValue(buildQuery([{ _id: "lease-1" }]));

    const res = await reconcileAttributions();
    expect(res.ok).toBe(false);
    expect(res.orphanConfirmedAttributions).toHaveLength(1);
    expect(res.orphanConfirmedAttributions[0].attributionId).toBe("attr-2");
  });

  it("detects duplicate confirmed attributions on the same lease", async () => {
    attributionStub.find.mockReturnValue(
      buildQuery([
        { _id: "attr-1", leaseId: "lease-1", status: "confirmed" },
        { _id: "attr-2", leaseId: "lease-1", status: "confirmed" },
      ]),
    );

    leaseStub.find.mockReturnValue(buildQuery([{ _id: "lease-1" }]));

    const res = await reconcileAttributions();
    expect(res.ok).toBe(false);
    expect(res.duplicateLeaseAttributions).toHaveLength(1);
    expect(res.duplicateLeaseAttributions[0].attributionIds).toEqual(["attr-1", "attr-2"]);
  });
});
