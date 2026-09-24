import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Property } from "@/hooks/use-properties";

const mocks = vi.hoisted(() => {
  const state = {
    deleteProperty: vi.fn(),
    pending: false,
    toast: { success: vi.fn(), error: vi.fn() },
  };
  return {
    ...state,
    usePropertyMutations: () => ({
      createProperty: vi.fn(),
      updateProperty: vi.fn(),
      deleteProperty: state.deleteProperty,
      pending: state.pending,
    }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-properties", () => ({ usePropertyMutations: mocks.usePropertyMutations }));

import { DeletePropertyDialog } from "@/components/dialogs/DeletePropertyDialog";

const property: Property = {
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

describe("DeletePropertyDialog", () => {
  it("deletes the property and closes with a success toast", async () => {
    mocks.deleteProperty.mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <DeletePropertyDialog
        open
        onOpenChange={onOpenChange}
        property={property}
        onDeleted={onDeleted}
      />,
    );

    expect(screen.getByText("Delete Sunset Villa?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete property" }));

    await waitFor(() => expect(mocks.deleteProperty).toHaveBeenCalledWith(property._id));
    expect(mocks.toast.success).toHaveBeenCalledWith("Property deleted", expect.any(Object));
    expect(onDeleted).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("surfaces tenant-reference errors in the error toast", async () => {
    mocks.deleteProperty.mockRejectedValue(new Error("Property is in use by tenants"));
    render(<DeletePropertyDialog open onOpenChange={vi.fn()} property={property} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete property" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not delete property", {
      description: "Property is in use by tenants",
    });
  });

  it("does nothing when no property is selected", async () => {
    render(<DeletePropertyDialog open onOpenChange={vi.fn()} property={null} />);

    expect(screen.getByText("Delete this property?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete property" }));

    await waitFor(() => expect(mocks.deleteProperty).not.toHaveBeenCalled());
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
});
