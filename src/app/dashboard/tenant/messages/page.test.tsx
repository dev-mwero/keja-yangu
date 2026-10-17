import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", null, props.children),
  };
});
vi.mock("@/components/tenant/TenantChatPanel", async () => {
  const { createElement } = await import("react");
  return { TenantChatPanel: () => createElement("div", null, "Chat panel") };
});
vi.mock("@/components/tenant/TenantAnnouncementsPanel", async () => {
  const { createElement } = await import("react");
  return { TenantAnnouncementsPanel: () => createElement("div", null, "Announcements panel") };
});
vi.mock("@/config/dashboardNav", () => ({ tenantNav: [] }));

import TenantMessagesPage from "@/app/dashboard/tenant/messages/page";

describe("tenant messages page", () => {
  it("shows chat first and switches to announcements", async () => {
    render(<TenantMessagesPage />);

    expect(screen.getByRole("tab", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByText("Chat panel")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Announcements" }));

    expect(await screen.findByText("Announcements panel")).toBeInTheDocument();
  });
});
