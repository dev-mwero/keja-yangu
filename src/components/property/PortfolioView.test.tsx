import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const properties: Array<Record<string, unknown>> = [];
  return {
    properties,
    useProperties: () => ({ properties, loading: false, refetch: vi.fn() }),
  };
});

vi.mock("@/hooks/use-properties", () => ({ useProperties: mocks.useProperties }));
vi.mock("@/components/DashboardShell", async () => {
  const { createElement } = await import("react");
  return {
    DashboardShell: (props: { children?: React.ReactNode }) =>
      createElement("div", { "data-testid": "shell" }, props.children),
  };
});
vi.mock("@/components/property/PropertyCardWithActions", async () => {
  const { createElement } = await import("react");
  return {
    PropertyCardWithActions: ({ property }: { property: { title: string } }) =>
      createElement("div", null, property.title),
  };
});
vi.mock("@/components/dialogs/PropertyDialog", async () => {
  const { createElement } = await import("react");
  return { PropertyDialog: () => createElement("div") };
});

import { PortfolioView } from "@/components/property/PortfolioView";

const properties = [
  {
    _id: "prop-1",
    title: "Sunset Villa",
    location: "Kilimani",
    type: "apartment",
    status: "available",
    price: 45000,
  },
  {
    _id: "prop-2",
    title: "River Court",
    location: "Westlands",
    type: "apartment",
    status: "occupied",
    price: 60000,
  },
] as never[];

describe("PortfolioView search", () => {
  beforeEach(() => {
    mocks.properties.length = 0;
  });

  it("filters properties by the search box", async () => {
    mocks.properties.push(...properties);
    render(<PortfolioView nav={[]} roleName="Owner" />);

    expect(screen.getByText("Sunset Villa")).toBeInTheDocument();
    expect(screen.getByText("River Court")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search properties…"), "river");

    expect(screen.getByText("River Court")).toBeInTheDocument();
    expect(screen.queryByText("Sunset Villa")).not.toBeInTheDocument();
  });
});
