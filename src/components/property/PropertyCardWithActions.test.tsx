import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/dashboard/owner/portfolio" }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("@/components/PropertyCard", () => ({ PropertyCard: () => null }));
vi.mock("@/components/dialogs/PropertyDialog", () => ({ PropertyDialog: () => null }));
vi.mock("@/components/dialogs/DeletePropertyDialog", () => ({
  DeletePropertyDialog: () => null,
}));

import { PropertyCardWithActions } from "@/components/property/PropertyCardWithActions";

const property = {
  _id: "prop-1",
  title: "Sunset Villa",
  type: "apartment",
  location: "Kilimani",
  price: 45000,
  description: "",
  images: [],
  amenities: [],
  caretakerIds: [],
  beds: 1,
  baths: 1,
  area: 1,
  status: "available",
  published: true,
  ownerId: "owner-1",
} as never;

describe("PropertyCardWithActions structure link", () => {
  it("does not duplicate the portfolio segment in the role dashboard path", () => {
    pathname.value = "/dashboard/owner/portfolio";
    render(<PropertyCardWithActions property={property} canEdit />);

    expect(screen.getByRole("link", { name: /manage structure/i })).toHaveAttribute(
      "href",
      "/dashboard/owner/portfolio/prop-1/structure",
    );
  });

  it("builds the correct href for each role dashboard", () => {
    for (const role of ["owner", "custodian", "system-admin"]) {
      pathname.value = `/dashboard/${role}/portfolio`;
      const { unmount } = render(<PropertyCardWithActions property={property} canEdit />);
      expect(screen.getByRole("link", { name: /manage structure/i })).toHaveAttribute(
        "href",
        `/dashboard/${role}/portfolio/prop-1/structure`,
      );
      unmount();
    }
  });
});
