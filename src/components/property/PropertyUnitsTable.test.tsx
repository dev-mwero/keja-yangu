import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropertyUnitsTable } from "@/components/property/PropertyUnitsTable";
import type { PropertyBlock } from "@/hooks/use-properties";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const blocks: PropertyBlock[] = [
  {
    _id: "b1",
    name: "Block A",
    order: 0,
    rentOverride: null,
    floors: [
      { _id: "f1", level: 0, label: "Ground", unitsPerFloor: 2, rentOverride: null },
      { _id: "f2", level: 1, label: "", unitsPerFloor: 1, rentOverride: 30000 },
    ],
  },
];

const availableUnit = {
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
};

const occupiedUnit = {
  ...availableUnit,
  _id: "u2",
  floorId: "f2",
  floorLevel: 1,
  floorLabel: "",
  name: "1A",
  status: "occupied",
  rent: 15000,
  beds: 0,
  baths: 0,
  tenantId: "ten-1",
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const href = String(url);
    if (init?.method === "PATCH") {
      return Promise.resolve({ ok: true, json: async () => ({ data: availableUnit }) });
    }
    if (init?.method === "DELETE") {
      return Promise.resolve({ ok: true, json: async () => ({ data: {} }) });
    }
    if (href.includes("/api/v1/units")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [availableUnit, occupiedUnit],
          pagination: { total: 2, page: 1, limit: 100, hasNextPage: false },
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("PropertyUnitsTable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    stubFetch();
  });

  it("lists units with resolved rent and shows — for unset beds/baths", async () => {
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    expect(await screen.findByText("GA")).toBeInTheDocument();
    expect(screen.getByText("1A")).toBeInTheDocument();

    // GA inherits the property rent; 1A uses its own override.
    expect(screen.getByText("Ksh 20,000")).toBeInTheDocument();
    expect(screen.getByText("Ksh 15,000")).toBeInTheDocument();

    // GA has 2 beds; 1A has none set (beds + baths show "—").
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBe(2);
  });

  it("disables deleting an occupied unit", async () => {
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    expect(await screen.findByText("1A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete 1A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete GA" })).toBeEnabled();
  });

  it("opens the edit dialog prefilled and saves beds/baths", async () => {
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    await userEvent.click(await screen.findByRole("button", { name: "Edit GA" }));

    const beds = screen.getByLabelText("Bedrooms");
    expect(beds).toHaveValue(2);
    expect(screen.getByLabelText("Bathrooms")).toHaveValue(1);

    await userEvent.clear(beds);
    await userEvent.type(beds, "4");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([url, init]) => String(url) === "/api/v1/units/u1" && init?.method === "PATCH",
      );
      if (!patch) throw new Error("expected a PATCH request to /api/v1/units/u1");
      const body = JSON.parse((patch[1] as RequestInit).body as string);
      expect(body.beds).toBe(4);
      expect(body.baths).toBe(1);
    });
  });
});
