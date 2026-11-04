import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Announcement } from "@/types/communications";

const mocks = vi.hoisted(() => {
  const items: Announcement[] = [];
  const properties: Array<{ _id: string; title: string }> = [];
  const refetch = vi.fn();
  const createAnnouncement = vi.fn();
  const deleteAnnouncement = vi.fn();
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  return {
    items,
    properties,
    refetch,
    createAnnouncement,
    deleteAnnouncement,
    toast,
    user: { current: { id: "owner-1", role: "owner" } as { id: string; role: string } },
    useAnnouncements: vi.fn(() => ({ items, loading: false, error: null, refetch })),
    useAnnouncementMutations: vi.fn(() => ({
      createAnnouncement,
      deleteAnnouncement,
      pending: false,
    })),
  };
});

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/use-announcements", () => ({
  useAnnouncements: mocks.useAnnouncements,
  useAnnouncementMutations: mocks.useAnnouncementMutations,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user.current }) }));
vi.mock("@/hooks/use-properties", () => ({
  useProperties: () => ({ properties: mocks.properties }),
}));

import { StaffAnnouncementsPanel } from "@/components/communications/StaffAnnouncementsPanel";

function makeAnnouncement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    _id: "ann-1",
    title: "Water tank cleaning",
    body: "Thursday morning.",
    authorId: "owner-1",
    authorName: "Test Owner",
    author: "Test Owner",
    ownerId: "owner-1",
    propertyId: "",
    property: "All properties",
    pinned: false,
    audience: "tenants",
    createdAt: "2026-09-02T08:00:00.000Z",
    ...overrides,
  };
}

describe("StaffAnnouncementsPanel", () => {
  beforeEach(() => {
    mocks.items.length = 0;
    mocks.properties.length = 0;
    mocks.refetch.mockReset();
    mocks.createAnnouncement.mockReset();
    mocks.deleteAnnouncement.mockReset();
    mocks.toast.success.mockClear();
    mocks.toast.error.mockClear();
    mocks.toast.info.mockClear();
    mocks.user.current = { id: "owner-1", role: "owner" };
  });

  it("publishes to all properties by default", async () => {
    mocks.createAnnouncement.mockResolvedValue(makeAnnouncement());
    const user = userEvent.setup();
    render(<StaffAnnouncementsPanel />);

    await user.click(screen.getByRole("button", { name: /new announcement/i }));
    await user.type(screen.getByPlaceholderText(/security guard shift change/i), "Lift servicing");
    await user.type(screen.getByPlaceholderText(/write the announcement/i), "Friday 9am.");
    await user.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(mocks.createAnnouncement).toHaveBeenCalledWith({
        title: "Lift servicing",
        body: "Friday 9am.",
        audience: "tenants",
        pinned: false,
        propertyId: undefined,
      }),
    );
    expect(mocks.refetch).toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("publishes to a single selected property", async () => {
    mocks.properties.push({ _id: "prop-1", title: "Sunset Villa" });
    mocks.createAnnouncement.mockResolvedValue(makeAnnouncement({ propertyId: "prop-1" }));
    const user = userEvent.setup();
    render(<StaffAnnouncementsPanel />);

    await user.click(screen.getByRole("button", { name: /new announcement/i }));
    await user.type(screen.getByPlaceholderText(/security guard shift change/i), "Lift servicing");
    await user.type(screen.getByPlaceholderText(/write the announcement/i), "Friday 9am.");

    const sendTo = within(screen.getByText("Send to").parentElement as HTMLElement);
    await user.click(sendTo.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Sunset Villa" }));

    await user.click(screen.getByRole("button", { name: /publish/i }));

    await waitFor(() =>
      expect(mocks.createAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({ propertyId: "prop-1" }),
      ),
    );
  });

  it("requires a title and message before publishing", async () => {
    const user = userEvent.setup();
    render(<StaffAnnouncementsPanel />);

    await user.click(screen.getByRole("button", { name: /new announcement/i }));
    await user.click(screen.getByRole("button", { name: /publish/i }));

    expect(mocks.createAnnouncement).not.toHaveBeenCalled();
    expect(mocks.toast.error).toHaveBeenCalledWith("Title and message are required");
  });

  it("lets an owner delete any announcement", async () => {
    mocks.items.push(makeAnnouncement({ authorId: "caretaker-1" }));
    mocks.deleteAnnouncement.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StaffAnnouncementsPanel />);

    await user.click(screen.getByRole("button", { name: /delete water tank cleaning/i }));
    expect(mocks.deleteAnnouncement).toHaveBeenCalledWith("ann-1");
    expect(mocks.refetch).toHaveBeenCalled();
  });

  it("hides delete from a caretaker for announcements they did not author", () => {
    mocks.user.current = { id: "caretaker-1", role: "caretaker" };
    mocks.items.push(makeAnnouncement({ authorId: "owner-1" }));
    render(<StaffAnnouncementsPanel />);

    expect(
      screen.queryByRole("button", { name: /delete water tank cleaning/i }),
    ).not.toBeInTheDocument();
  });
});
