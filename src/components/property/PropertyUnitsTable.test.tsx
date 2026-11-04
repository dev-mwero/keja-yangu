import { render, screen, waitFor, within } from "@testing-library/react";
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
  tenantId: [] as string[],
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
  tenantId: ["ten-1"],
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
    if (href.includes("/api/v1/tenants")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          data: [
            {
              _id: "ten-9",
              name: "Mary Njeri",
              email: "mary@keja.co",
              propertyId: "prop-1",
              ownerId: "owner-1",
              status: "active",
            },
          ],
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

  it("offers Assign tenant for available units only", async () => {
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    expect(await screen.findByRole("button", { name: "Assign tenant to GA" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign tenant to 1A" })).not.toBeInTheDocument();
  });

  it("offers Unassign tenant for occupied units only", async () => {
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    expect(
      await screen.findByRole("button", { name: "Unassign tenant from 1A" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Unassign tenant from GA" }),
    ).not.toBeInTheDocument();
  });

  it("unassigns the tenant from an occupied unit", async () => {
    const user = userEvent.setup();
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    await user.click(await screen.findByRole("button", { name: "Unassign tenant from 1A" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Unassign tenant" }));

    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/v1/tenants/ten-1/assignment" && init?.method === "DELETE",
      );
      if (!del) throw new Error("expected a DELETE to /api/v1/tenants/ten-1/assignment");
    });
    expect(
      await screen.findByRole("button", { name: "Unassign tenant from 1A" }),
    ).toBeInTheDocument();
  });

  it("assigns an unassigned tenant to an available unit", async () => {
    const user = userEvent.setup();
    render(<PropertyUnitsTable propertyId="prop-1" blocks={blocks} baseRent={20000} />);

    await user.click(await screen.findByRole("button", { name: "Assign tenant to GA" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /Mary Njeri/ }));
    await user.click(within(dialog).getByRole("button", { name: "Assign tenant" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/v1/tenants/ten-9/assignment" && init?.method === "POST",
      );
      if (!post) throw new Error("expected a POST to /api/v1/tenants/ten-9/assignment");
      const body = JSON.parse((post[1] as RequestInit).body as string);
      expect(body.unitId).toBe("u1");
    });
    expect(await screen.findByRole("button", { name: "Assign tenant to GA" })).toBeInTheDocument();
  });
});
