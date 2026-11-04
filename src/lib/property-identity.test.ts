/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import {
  computeIdentityHash,
  createPropertyClaim,
  findDuplicateCandidates,
} from "@/lib/property-identity";
import { Property } from "@/models/Property";
import { PropertyClaim } from "@/models/PropertyClaim";
import { buildQuery } from "@/test/utils/model-mocks";

vi.mock("@/models/Property", () => ({
  Property: {
    find: vi.fn(),
  },
}));

vi.mock("@/models/PropertyClaim", () => ({
  PropertyClaim: {
    create: vi.fn(),
  },
}));

describe("property-identity", () => {
  it("computes deterministic identity hash ignoring case and punctuation", () => {
    const hash1 = computeIdentityHash("Sunset Villa!", "Kilimani, Nairobi");
    const hash2 = computeIdentityHash("sunset villa", "kilimani nairobi");
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(32);
  });

  it("finds duplicate candidates using identity hash", async () => {
    const mockCandidates = [{ _id: "p1", title: "Sunset Villa", location: "Kilimani, Nairobi" }];
    vi.mocked(Property.find).mockReturnValue(
      buildQuery(mockCandidates) as unknown as ReturnType<typeof Property.find>,
    );

    const duplicates = await findDuplicateCandidates("Sunset Villa", "Kilimani, Nairobi", "p2");

    expect(duplicates).toEqual([
      { _id: "p1", title: "Sunset Villa", location: "Kilimani, Nairobi" },
    ]);
    expect(Property.find).toHaveBeenCalledWith(
      expect.objectContaining({
        identityHash: computeIdentityHash("Sunset Villa", "Kilimani, Nairobi"),
        _id: { $ne: "p2" },
        deletedAt: null,
        lifecycleState: "active",
      }),
    );
  });

  it("creates property claim with pending status", async () => {
    const mockCreated = {
      _id: "claim1",
      propertyId: "p1",
      claimantUserId: "u1",
      evidence: "Title deed doc",
      status: "pending",
    };
    vi.mocked(PropertyClaim.create).mockResolvedValue(mockCreated as unknown as never);

    const claim = await createPropertyClaim("u1", "p1", "Title deed doc");

    expect(claim).toEqual(mockCreated);
    expect(PropertyClaim.create).toHaveBeenCalledWith({
      propertyId: "p1",
      claimantUserId: "u1",
      evidence: "Title deed doc",
      status: "pending",
    });
  });
});
