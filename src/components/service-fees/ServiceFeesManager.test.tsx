import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceFeesManager } from "@/components/service-fees/ServiceFeesManager";

const unit = {
  _id: "507f1f77bcf86cd799439011",
  propertyId: "prop-1",
  name: "GA",
  blockName: "Block A",
  floorLabel: "Ground",
};

let fetchMock: ReturnType<typeof vi.fn>;

describe("ServiceFeesManager", () => {
  beforeEach(() => {
    fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const href = String(url);
      if (href === "/api/v1/properties/prop-1/service-fees" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { _id: "fee-1", ...JSON.parse(init.body as string) } }),
        });
      }
      if (href.startsWith("/api/v1/properties/prop-1/service-fees")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { items: [], overrides: [] } }),
        });
      }
      if (href.startsWith("/api/v1/units?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [unit],
            pagination: { total: 1, page: 1, limit: 100, hasNextPage: false },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("creates a fee for selected units", async () => {
    const user = userEvent.setup();
    render(<ServiceFeesManager propertyId="prop-1" />);

    await user.click(await screen.findByRole("button", { name: "Add fee item" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Fee name"), "Water");
    await user.clear(within(dialog).getByLabelText("Monthly amount (KES)"));
    await user.type(within(dialog).getByLabelText("Monthly amount (KES)"), "500");

    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Selected units" }));
    await user.click(await screen.findByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Add fee item" }));

    await waitFor(() => {
      const create = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url) === "/api/v1/properties/prop-1/service-fees" && init?.method === "POST",
      );
      expect(create).toBeDefined();
      expect(JSON.parse((create?.[1] as RequestInit).body as string)).toMatchObject({
        label: "Water",
        amount: 500,
        appliesTo: "selected",
        unitIds: [unit._id],
      });
    });
  });
});