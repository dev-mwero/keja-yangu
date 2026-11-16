import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const types: Array<Record<string, unknown>> = [];
  const refetch = vi.fn();
  const createType = vi.fn().mockResolvedValue({});
  const updateType = vi.fn().mockResolvedValue({});
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    types,
    refetch,
    createType,
    updateType,
    toast,
    pending: false,
    usePropertyTypes: () => ({ types, loading: false, error: null, refetch }),
    usePropertyTypeMutations: () => ({ createType, updateType, pending: mocks.pending }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-property-types", () => ({
  usePropertyTypes: mocks.usePropertyTypes,
  usePropertyTypeMutations: mocks.usePropertyTypeMutations,
}));

import { PropertyTypeManager } from "@/components/admin/PropertyTypeManager";

function resetState() {
  mocks.types.length = 0;
  mocks.refetch.mockClear();
  mocks.createType.mockClear();
  mocks.updateType.mockClear();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
}

beforeEach(resetState);

function seedTypes() {
  mocks.types.push(
    { id: "1", key: "apartment", label: "Apartment", active: true },
    { id: "2", key: "villa", label: "Villa", active: false },
  );
}

describe("PropertyTypeManager", () => {
  it("renders the type list with active/inactive badges", () => {
    seedTypes();
    render(<PropertyTypeManager />);

    expect(screen.getByText("Apartment")).toBeInTheDocument();
    expect(screen.getByText("Villa")).toBeInTheDocument();
    // StatCard "Inactive" count plus the row badge.
    expect(screen.getAllByText("Inactive").length).toBeGreaterThan(0);
  });

  it("shows an empty state when there are no types", () => {
    render(<PropertyTypeManager />);
    expect(screen.getByText(/no property types yet/i)).toBeInTheDocument();
  });

  it("adds a new type and refetches", async () => {
    render(<PropertyTypeManager />);

    const input = screen.getByLabelText("Name");
    await userEvent.type(input, "Townhouse");
    await userEvent.click(screen.getByRole("button", { name: "Add type" }));

    expect(mocks.createType).toHaveBeenCalledWith("Townhouse");
    expect(mocks.toast.success).toHaveBeenCalledWith("Property type added", {
      description: "Townhouse",
    });
    expect(mocks.refetch).toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("renames a type inline", async () => {
    seedTypes();
    render(<PropertyTypeManager />);

    const renameButtons = screen.getAllByRole("button", { name: "Rename" });
    await userEvent.click(renameButtons[1]);

    const editInput = screen.getByDisplayValue("Villa");
    expect(editInput).toBeInTheDocument();
    await userEvent.clear(editInput);
    await userEvent.type(editInput, "Bungalow");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.updateType).toHaveBeenCalledWith("2", { label: "Bungalow" });
    expect(mocks.toast.success).toHaveBeenCalledWith("Property type renamed");
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("toggles a type active state", async () => {
    seedTypes();
    render(<PropertyTypeManager />);

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    // The second switch belongs to the inactive "Villa" type.
    await userEvent.click(switches[1]);
    expect(mocks.updateType).toHaveBeenCalledWith("2", { active: true });
    expect(mocks.toast.success).toHaveBeenCalledWith("Property type activated");
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("reports a failed add", async () => {
    mocks.createType.mockRejectedValueOnce(new Error("duplicate key"));
    render(<PropertyTypeManager />);

    await userEvent.type(screen.getByLabelText("Name"), "Villa");
    await userEvent.click(screen.getByRole("button", { name: "Add type" }));

    expect(mocks.createType).toHaveBeenCalledWith("Villa");
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not add property type", {
      description: "duplicate key",
    });
    expect(mocks.refetch).not.toHaveBeenCalled();
  });
});
