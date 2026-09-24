import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Property } from "@/hooks/use-properties";
import type { Tenant } from "@/hooks/use-tenants";

const mocks = vi.hoisted(() => {
  const tenants = [] as Tenant[];
  const properties = [] as Property[];
  const flags = {
    loading: false,
    error: null as string | null,
    pending: false,
  };
  const createTenant = vi.fn();
  const updateTenant = vi.fn();
  const deleteTenant = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn() };
  return {
    tenants,
    properties,
    flags,
    createTenant,
    updateTenant,
    deleteTenant,
    toast,
    useTenants: () => ({
      tenants,
      loading: flags.loading,
      error: flags.error,
      refetch: vi.fn(),
    }),
    useProperties: () => ({
      properties,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useTenantMutations: () => ({
      createTenant,
      updateTenant,
      deleteTenant,
      pending: flags.pending,
    }),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { title?: string; subtitle?: string; children?: React.ReactNode }) =>
      createElement("div", { "data-testid": "shell" }, props.title, props.subtitle, props.children),
  };
});
vi.mock("@/hooks/use-tenants", () => ({
  useTenants: mocks.useTenants,
  useTenantMutations: mocks.useTenantMutations,
}));
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));

import { TenantsManager } from "@/components/tenants/TenantsManager";

const properties: Property[] = [
  {
    _id: "prop-1",
    title: "Sunset Villa",
    type: "apartment",
    location: "Kilimani, Nairobi",
    price: 45000,
    description: "",
    images: [],
    amenities: [],
    status: "available",
    ownerId: "o1",
    caretakerIds: [],
    beds: 2,
    baths: 1,
    area: 60,
  },
  {
    _id: "prop-2",
    title: "Rose Court",
    type: "building",
    location: "Westlands, Nairobi",
    price: 90000,
    description: "",
    images: [],
    amenities: [],
    status: "available",
    ownerId: "o1",
    caretakerIds: [],
    beds: 6,
    baths: 3,
    area: 200,
  },
];

const tenants: Tenant[] = [
  {
    _id: "ten-1",
    name: "Amina Otieno",
    email: "amina@keja.co",
    propertyId: "prop-1",
    ownerId: "o1",
    status: "active",
    joinedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    _id: "ten-2",
    name: "Brian Mwangi",
    email: "brian@keja.co",
    propertyId: "prop-2",
    ownerId: "o1",
    status: "pending",
  },
];

function renderManager(overrides: Partial<Parameters<typeof TenantsManager>[0]> = {}) {
  render(<TenantsManager nav={[]} roleName="Owner" canSetStatus {...overrides} />);
}

/**
 * Radix Select triggers expose an empty accessible name in jsdom, so target
 * them by their rendered text content instead of `{ name: ... }`.
 */
function comboboxByText(scope: HTMLElement, text: string) {
  const combo = within(scope)
    .getAllByRole("combobox")
    .find((el) => el.textContent === text);
  if (!combo) throw new Error(`No combobox found with text: "${text}"`);
  return combo;
}

const addInputs = {
  name: "Amina Otieno",
  email: "AMINA@keja.co",
  phone: "+254700000000",
  notes: "First floor",
};

describe("TenantsManager", () => {
  beforeEach(() => {
    mocks.tenants.length = 0;
    mocks.properties.length = 0;
    mocks.flags.loading = false;
    mocks.flags.error = null;
    mocks.flags.pending = false;
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.createTenant.mockReset();
    mocks.updateTenant.mockReset();
    mocks.deleteTenant.mockReset();
  });

  it("renders the shell title and tenant rows", () => {
    mocks.tenants.push(...tenants);
    mocks.properties.push(...properties);
    renderManager();

    expect(screen.getByTestId("shell")).toHaveTextContent("Tenants");
    expect(screen.getByText("Amina Otieno")).toBeInTheDocument();
    expect(screen.getByText("Brian Mwangi")).toBeInTheDocument();
    expect(screen.getByText("amina@keja.co")).toBeInTheDocument();
    expect(screen.getByText("Sunset Villa")).toBeInTheDocument();
  });

  it("shows status counts on the tabs", () => {
    mocks.tenants.push(...tenants);
    mocks.properties.push(...properties);
    renderManager();

    expect(screen.getByRole("tab", { name: /all/i })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /pending/i })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /active/i })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /rejected/i })).toHaveTextContent("0");
  });

  it("filters rows by status tab", async () => {
    const user = userEvent.setup();
    mocks.tenants.push(...tenants);
    mocks.properties.push(...properties);
    renderManager();

    await user.click(screen.getByRole("tab", { name: /active/i }));

    expect(screen.getByText("Amina Otieno")).toBeInTheDocument();
    expect(screen.queryByText("Brian Mwangi")).not.toBeInTheDocument();
  });

  it("empty state is shown with no rows", () => {
    renderManager();
    expect(screen.getByText("No tenants in this view")).toBeInTheDocument();
  });

  it("validates the create form before submitting", async () => {
    mocks.properties.push(...properties);
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Add tenant" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add tenant" }));

    expect(await within(dialog).findByText("Name is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Email is required")).toBeInTheDocument();
    expect(within(dialog).getByText("Select a property")).toBeInTheDocument();
    expect(mocks.createTenant).not.toHaveBeenCalled();
  });

  it("creates a tenant without a status when canSetStatus is false", async () => {
    const user = userEvent.setup();
    mocks.properties.push(...properties);
    mocks.createTenant.mockResolvedValue(tenants[0]);
    renderManager({ canSetStatus: false });

    fireEvent.click(screen.getByRole("button", { name: "Add tenant" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("pending")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: addInputs.name } });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: addInputs.email },
    });
    fireEvent.change(within(dialog).getByLabelText("Phone"), {
      target: { value: addInputs.phone },
    });
    fireEvent.change(within(dialog).getByLabelText("Notes"), {
      target: { value: addInputs.notes },
    });

    await user.click(comboboxByText(dialog, "Select property"));
    await user.click(await screen.findByRole("option", { name: "Sunset Villa" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Add tenant" }));

    await waitFor(() => expect(mocks.createTenant).toHaveBeenCalled());
    expect(mocks.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Amina Otieno",
        email: "amina@keja.co",
        phone: "+254700000000",
        propertyId: "prop-1",
        notes: "First floor",
      }),
    );
    const payload = mocks.createTenant.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("status");
    expect(mocks.toast.success).toHaveBeenCalledWith("Tenant added", expect.any(Object));
  });

  it("includes the default pending status when canSetStatus is true", async () => {
    const user = userEvent.setup();
    mocks.properties.push(...properties);
    mocks.createTenant.mockResolvedValue(tenants[0]);
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Add tenant" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: addInputs.name } });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: addInputs.email },
    });
    await user.click(comboboxByText(dialog, "Select property"));
    await user.click(await screen.findByRole("option", { name: "Sunset Villa" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Add tenant" }));

    await waitFor(() => expect(mocks.createTenant).toHaveBeenCalled());
    const payload = mocks.createTenant.mock.calls[0][0] as { status?: string };
    expect(payload.status).toBe("pending");
  });

  it("edits an existing tenant", async () => {
    const user = userEvent.setup();
    mocks.tenants.push(...tenants);
    mocks.properties.push(...properties);
    mocks.updateTenant.mockResolvedValue(tenants[0]);
    renderManager();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Edit tenant")).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText("Name");
    await user.clear(nameInput);
    await user.type(nameInput, "Amina Wanjiru");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateTenant).toHaveBeenCalled());
    expect(mocks.updateTenant).toHaveBeenCalledWith(
      "ten-1",
      expect.objectContaining({
        name: "Amina Wanjiru",
        email: "amina@keja.co",
        propertyId: "prop-1",
      }),
    );
  });

  it("deletes a tenant through the confirmation dialog", async () => {
    mocks.tenants.push(...tenants);
    mocks.properties.push(...properties);
    mocks.deleteTenant.mockResolvedValue(undefined);
    renderManager();

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Remove Amina Otieno?")).toBeInTheDocument();

    fireEvent.click(within(confirm).getByRole("button", { name: "Remove tenant" }));

    await waitFor(() => expect(mocks.deleteTenant).toHaveBeenCalledWith("ten-1"));
    expect(mocks.toast.success).toHaveBeenCalledWith("Tenant removed", expect.any(Object));
  });

  it("surfaces create errors through the error toast", async () => {
    const user = userEvent.setup();
    mocks.properties.push(...properties);
    mocks.createTenant.mockRejectedValue(new Error("Network error"));
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Add tenant" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: addInputs.name } });
    fireEvent.change(within(dialog).getByLabelText("Email"), {
      target: { value: addInputs.email },
    });
    await user.click(comboboxByText(dialog, "Select property"));
    await user.click(await screen.findByRole("option", { name: "Sunset Villa" }));

    fireEvent.click(within(dialog).getByRole("button", { name: "Add tenant" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled());
    expect(mocks.toast.error).toHaveBeenCalledWith("Could not add tenant", {
      description: "Network error",
    });
  });
});
