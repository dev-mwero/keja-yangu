import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const units = [
  {
    _id: "u1",
    propertyId: "prop-1",
    ownerId: "owner-1",
    blockId: "b1",
    blockName: "Block A",
    floorId: "f1",
    floorLevel: 0,
    floorLabel: "Ground",
    name: "GA",
    letter: "A",
    status: "available",
    rent: null,
    beds: 2,
    baths: 1,
    area: 0,
    tenantId: "",
  },
];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const href = String(url);
      if (href.endsWith("/unit-counts")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { total: 5, occupied: 4, vacant: 1, maintenance: 0 } }),
        });
      }
      if (href.includes("/api/v1/units")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: units,
            pagination: { total: units.length, page: 1, limit: 100, hasNextPage: false },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: property }) });
    }),
  );
}

describe("PropertyStructureView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubFetch();
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

    // Saved occupancy strip (from /unit-counts)
    expect(await screen.findByText("Current occupancy")).toBeInTheDocument();
    expect(screen.getByText("occupied")).toBeInTheDocument();
    expect(screen.getByText("vacant")).toBeInTheDocument();
  });

  it("starts read-only and reveals the editor only after clicking Edit", async () => {
    render(<PropertyStructureView propertyId="prop-1" nav={[]} roleName="Owner" backHref="/x" />);

    // Read-only: no save button, no editable block-name input.
    await screen.findByText("Monthly rent");
    expect(screen.queryByRole("button", { name: /save structure/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Block name")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: /save structure/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Block name")).toBeInTheDocument();
  });

  it("lists this property's units with details and actions", async () => {
    render(<PropertyStructureView propertyId="prop-1" nav={[]} roleName="Owner" backHref="/x" />);

    expect(await screen.findByText("GA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit GA" })).toBeInTheDocument();
    // Unit is vacant, so delete is enabled.
    expect(screen.getByRole("button", { name: "Delete GA" })).toBeEnabled();
  });

  it("renders a read-only preview of the saved structure", async () => {
    render(<PropertyStructureView propertyId="prop-1" nav={[]} roleName="Owner" backHref="/x" />);

    // Preview lists each floor with its generated unit names.
    expect(await screen.findByText(/2 units · GA, GB/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });
});
