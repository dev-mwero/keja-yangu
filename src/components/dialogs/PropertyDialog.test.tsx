import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Property } from "@/hooks/use-properties";

const mocks = vi.hoisted(() => {
  const state = {
    createProperty: vi.fn(),
    updateProperty: vi.fn(),
    deleteProperty: vi.fn(),
    pending: false,
    caretakers: [] as Array<{ id: string; name: string; email: string }>,
    toast: { success: vi.fn(), error: vi.fn() },
  };
  return {
    ...state,
    usePropertyMutations: () => ({
      createProperty: state.createProperty,
      updateProperty: state.updateProperty,
      deleteProperty: state.deleteProperty,
      pending: state.pending,
    }),
    useCaretakers: () => ({
      caretakers: state.caretakers,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-properties", () => ({ usePropertyMutations: mocks.usePropertyMutations }));
vi.mock("@/hooks/use-caretakers", () => ({ useCaretakers: mocks.useCaretakers }));

import { PropertyDialog } from "@/components/dialogs/PropertyDialog";

function openDialog(overrides: Partial<Parameters<typeof PropertyDialog>[0]> = {}) {
  render(<PropertyDialog open onOpenChange={vi.fn()} mode="create" {...overrides} />);
}

const editProperty: Property = {
  _id: "dce2b032481698ae7cfe04d2",
  title: "Sunset Villa",
  type: "apartment",
  location: "Kilimani, Nairobi",
  price: 45000,
  description: "A sunny apartment",
  images: [],
  amenities: [],
  status: "available",
  ownerId: "dce2b032481698ae7cfe04d1",
  caretakerIds: [],
  beds: 2,
  baths: 1,
  area: 60,
};

describe("PropertyDialog", () => {
  it("shows validation errors when required fields are missing", async () => {
    openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Location is required")).toBeInTheDocument();
    expect(mocks.createProperty).not.toHaveBeenCalled();
  });

  it("submits a create payload and closes on success", async () => {
    mocks.createProperty.mockResolvedValue(editProperty);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    openDialog({ onSuccess, onOpenChange });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset Villa" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kilimani, Nairobi" } });
    fireEvent.change(screen.getByLabelText("Price (KES/month)"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    await waitFor(() => expect(mocks.createProperty).toHaveBeenCalled());
    expect(mocks.createProperty).toHaveBeenCalledWith({
      title: "Sunset Villa",
      type: "apartment",
      location: "Kilimani, Nairobi",
      price: 45000,
      description: undefined,
      images: [],
      amenities: [],
      beds: 0,
      baths: 0,
      caretakerIds: [],
    });
    expect(mocks.toast.success).toHaveBeenCalledWith("Property created", expect.any(Object));
    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("omits caretakerIds from the payload when caretaker assignment is not allowed", async () => {
    mocks.createProperty.mockResolvedValue(editProperty);
    openDialog({ allowCaretakerIds: false });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset Villa" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kilimani, Nairobi" } });
    fireEvent.change(screen.getByLabelText("Price (KES/month)"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    await waitFor(() => expect(mocks.createProperty).toHaveBeenCalled());
    const payload = mocks.createProperty.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("caretakerIds");
    expect(screen.queryByText("Assigned caretakers")).not.toBeInTheDocument();
  });

  it("requires a target owner id in system-admin create mode", async () => {
    openDialog({ systemAdmin: true });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset Villa" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kilimani, Nairobi" } });
    fireEvent.change(screen.getByLabelText("Price (KES/month)"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    expect(await screen.findByText("Property owner id is required")).toBeInTheDocument();
    expect(mocks.createProperty).not.toHaveBeenCalled();
  });

  it("system-admin create passes targetOwnerId through", async () => {
    mocks.createProperty.mockResolvedValue(editProperty);
    openDialog({ systemAdmin: true });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset Villa" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kilimani, Nairobi" } });
    fireEvent.change(screen.getByLabelText("Price (KES/month)"), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText("Property owner id"), {
      target: { value: "dce2b032481698ae7cfe04d1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    await waitFor(() => expect(mocks.createProperty).toHaveBeenCalled());
    const payload = mocks.createProperty.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.targetOwnerId).toBe("dce2b032481698ae7cfe04d1");
  });

  it("edit mode submits status and calls updateProperty", async () => {
    mocks.updateProperty.mockResolvedValue(editProperty);
    openDialog({ mode: "edit", property: editProperty });

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed Villa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateProperty).toHaveBeenCalled());
    expect(mocks.updateProperty).toHaveBeenCalledWith(
      editProperty._id,
      expect.objectContaining({ title: "Renamed Villa", status: "available" }),
    );
  });

  it("surfaces create errors through the error toast", async () => {
    mocks.createProperty.mockRejectedValue(new Error("boom"));
    openDialog();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset Villa" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kilimani, Nairobi" } });
    fireEvent.change(screen.getByLabelText("Price (KES/month)"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not create property", {
      description: "boom",
    });
  });

  it("toggles caretaker chips and includes them in the payload", async () => {
    mocks.createProperty.mockResolvedValue(editProperty);
    mocks.caretakers.push({ id: "care-1", name: "Amka", email: "amka@keja.co" });
    openDialog();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Sunset Villa" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Kilimani, Nairobi" } });
    fireEvent.change(screen.getByLabelText("Price (KES/month)"), { target: { value: "45000" } });

    const chip = screen.getByRole("button", { name: "Amka" });
    await userEvent.click(chip);

    fireEvent.click(screen.getByRole("button", { name: "Create property" }));

    await waitFor(() => expect(mocks.createProperty).toHaveBeenCalled());
    const payload = mocks.createProperty.mock.calls[0][0] as { caretakerIds?: string[] };
    expect(payload.caretakerIds).toEqual(["care-1"]);
  });
});
