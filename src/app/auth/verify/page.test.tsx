import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import VerifyPage from "./page";

const replaceMock = vi.fn();
let currentToken: string | null = "test-token";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === "token" ? currentToken : null),
  }),
}));

describe("VerifyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentToken = "test-token";
  });

  it("shows error when token is missing", async () => {
    currentToken = null;
    render(<VerifyPage />);

    expect(
      await screen.findByText("This verification link is missing a token."),
    ).toBeInTheDocument();
  });

  it("calls verify-email and displays success state with redirect link", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: "Email verified successfully",
        redirectTo: "/dashboard/tenant",
      }),
    } as Response);

    render(<VerifyPage />);

    expect(await screen.findByText("Email verified")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /continue to dashboard/i });
    expect(link).toHaveAttribute("href", "/dashboard/tenant");

    await waitFor(
      () => {
        expect(replaceMock).toHaveBeenCalledWith("/dashboard/tenant");
      },
      { timeout: 2500 },
    );
  });

  it("shows error state when verification API fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invalid or expired verification token" }),
    } as Response);

    render(<VerifyPage />);

    expect(await screen.findByText("Invalid or expired verification token")).toBeInTheDocument();
  });
});
