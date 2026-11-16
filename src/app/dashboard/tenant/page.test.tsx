import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const emptyList: never[] = [];
  return {
    currentUser: {
      id: "me",
      name: "Tess Tenant",
      email: "tess@keja.co",
    } as Record<string, unknown>,
    useAuth: () => ({ user: mocks.currentUser }),
    useProperties: () => ({
      properties: emptyList,
      loading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useTenantApplications: () => ({
      applications: emptyList,
      loading: false,
      error: null,
      refetch: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

vi.mock("@/components/DashboardShell", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    DashboardShell: (props: { title?: string; children?: React.ReactNode }) =>
      createElement(Fragment, null, props.title, props.children),
  };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));
vi.mock("@/hooks/use-applications", () => ({
  useTenantApplications: mocks.useTenantApplications,
}));
vi.mock("@/components/PropertyCard", () => ({ PropertyCard: () => null }));
vi.mock("@/components/property/RecentlyViewedProperties", () => ({
  RecentlyViewedProperties: () => null,
}));

import TenantDashboard from "@/app/dashboard/tenant/page";

describe("tenant dashboard", () => {
  it("renders the welcome-back shell", () => {
    render(<TenantDashboard />);
    expect(screen.getByText("Welcome back, Tess Tenant")).toBeInTheDocument();
  });
});
