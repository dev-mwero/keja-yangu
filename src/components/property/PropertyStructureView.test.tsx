import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", { "data-testid": "shell" }, props.children),
  };
});

vi.mock("@/hooks/use-properties", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-properties")>();
  return {
    ...actual,
    usePropertyMutations: () => ({ updateStructure: vi.fn(), pending: false }),
  };
});

import { PropertyStructureView } from "@/components/property/PropertyStructureView";

const property = {
  _id: "prop-1",
  title: "Valley View",
  type: "apartment",
  location: "Karen",
  price: 20000,
  description: "",
  images: [],
  amenities: [],
  status: "available",
  ownerId: "owner-1",
  caretakerIds: [],
  beds: 1,
  baths: 1,
  area: 1,
  published: true,
  blocks: [
    {
      _id: "b1",
      name: "Block A",
      order: 0,
      rentOverride: null,
      floors: [
        { _id: "f1", level: 0, label: "Ground", unitsPerFloor: 2, rentOverride: null },
        { _id: "f2", level: 1, label: "", unitsPerFloor: 3, rentOverride: 30000 },
      ],
    },
  ],
};

describe("PropertyStructureView summary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: property }) }),
    );
  });

  it("shows blocks, floors, units and the monthly rent roll at a glance", async () => {
    render(<PropertyStructureView propertyId="prop-1" nav={[]} roleName="Owner" backHref="/x" />);

    expect(await screen.findByText("Monthly rent")).toBeInTheDocument();
    expect(screen.getByText("Blocks")).toBeInTheDocument();
    expect(screen.getByText("Floors")).toBeInTheDocument();
    expect(screen.getAllByText("Units").length).toBeGreaterThan(0);

    // 2 units @ 20000 + 3 units @ 30000 (floor override) = 130000
    expect(screen.getByText("Ksh 130,000")).toBeInTheDocument();
    expect(screen.getByText("Ksh 20,000 – Ksh 30,000 per unit")).toBeInTheDocument();
  });
});
