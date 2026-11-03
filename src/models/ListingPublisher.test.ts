import { describe, expect, it } from "vitest";
import { ListingPublisher } from "@/models/ListingPublisher";

describe("ListingPublisher schema", () => {
  it("initializes with default values", () => {
    const doc = new ListingPublisher({
      listingId: "listing-1",
      publisherUserId: "user-1",
      shareCode: "sh-12345",
      createdByUserId: "user-1",
    });

    expect(doc.listingId).toBe("listing-1");
    expect(doc.publisherUserId).toBe("user-1");
    expect(doc.publisherRole).toBe("admin");
    expect(doc.brokerAuthorizationId).toBe("");
    expect(doc.shareCode).toBe("sh-12345");
    expect(doc.state).toBe("active");
    expect(doc.endsAt).toBeNull();
    expect(doc.createdByUserId).toBe("user-1");
    expect(doc.revokedByUserId).toBe("");
    expect(doc.revokedAt).toBeNull();
  });

  it("fails validation when required fields are missing", () => {
    const doc = new ListingPublisher({});
    const err = doc.validateSync();
    expect(err?.errors.listingId).toBeDefined();
    expect(err?.errors.publisherUserId).toBeDefined();
    expect(err?.errors.shareCode).toBeDefined();
    expect(err?.errors.createdByUserId).toBeDefined();
  });
});
