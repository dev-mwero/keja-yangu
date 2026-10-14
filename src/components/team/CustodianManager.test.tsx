import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustodianRow } from "@/hooks/use-custodians";

const mocks = vi.hoisted(() => {
  const custodians: CustodianRow[] = [];
  return {
    custodians,
    useCustodians: () => ({ custodians, loading: false, error: null, refetch: vi.fn() }),
    useCustodianMutations: () => ({
      inviteCustodian: vi.fn(),
      revokeCustodian: vi.fn(),
      pending: false,
    }),
  };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/use-custodians", () => ({
  useCustodians: mocks.useCustodians,
  useCustodianMutations: mocks.useCustodianMutations,
}));

import { CustodianManager } from "@/components/team/CustodianManager";

const rows: CustodianRow[] = [
  {
    id: "cus-1",
    name: "Amina",
    email: "amina@keja.co",
    phone: "0700000001",
    managedByOwnerId: "owner-1",
  },
  {
    id: "cus-2",
    name: "Brian",
    email: "brian@keja.co",
    phone: "0700000002",
    managedByOwnerId: "owner-1",
  },
];

describe("CustodianManager search", () => {
  beforeEach(() => {
    mocks.custodians.length = 0;
  });

  it("filters custodians by the search box", async () => {
    mocks.custodians.push(...rows);
    render(<CustodianManager />);

    expect(screen.getByText("Amina")).toBeInTheDocument();
    expect(screen.getByText("Brian")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search custodians…"), "brian@");

    expect(screen.getByText("Brian")).toBeInTheDocument();
    expect(screen.queryByText("Amina")).not.toBeInTheDocument();
  });
});
