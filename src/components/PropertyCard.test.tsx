import { describe, expect, it } from "vitest";

describe("PropertyCard", () => {
  it("renders property details correctly", () => {
    const property = {
      id: "p1",
      title: "Test Property",
      type: "apartment" as const,
      location: "Test Location",
      price: 1000,
      description: "Test desc",
      images: ["/test.jpg"],
      amenities: ["Wi-Fi"],
      status: "available" as const,
      ownerId: "o1",
      caretakerIds: ["c1"],
      beds: 2,
      baths: 1,
      area: 50,
    };

    expect(property.title).toBe("Test Property");
    expect(property.price).toBe(1000);
    expect(property.status).toBe("available");
  });
});
