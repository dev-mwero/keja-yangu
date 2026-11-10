import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGuard } from "@/components/AuthGuard";

const mocks = vi.hoisted(() => {
  const router = { push: vi.fn() };
  const container = {
    authState: {
      user: null as { role: string } | null,
      loading: false,
    },
  };
  return {
    router,
    container,
    useRouter: () => router,
    useAuth: () => container.authState,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: mocks.useRouter,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: mocks.useAuth,
}));

describe("AuthGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a spinner while loading", () => {
    mocks.container.authState = { user: null, loading: true };
    const { container } = render(
      <AuthGuard allowedRoles={["admin"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated user to /auth", () => {
    mocks.container.authState = { user: null, loading: false };
    render(
      <AuthGuard allowedRoles={["admin"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(mocks.router.push).toHaveBeenCalledWith("/auth");
  });

  it("renders children when user role is in allowedRoles", () => {
    mocks.container.authState = { user: { role: "admin" }, loading: false };
    render(
      <AuthGuard allowedRoles={["admin", "admin"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.getByText("Protected Content")).not.toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("allows admin user when allowedRoles specifies owner as legacy alias", () => {
    mocks.container.authState = { user: { role: "admin" }, loading: false };
    render(
      <AuthGuard allowedRoles={["admin"]}>
        <div>Owner Only Area</div>
      </AuthGuard>,
    );
    expect(screen.getByText("Owner Only Area")).not.toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("allows owner user when allowedRoles specifies admin", () => {
    mocks.container.authState = { user: { role: "admin" }, loading: false };
    render(
      <AuthGuard allowedRoles={["admin"]}>
        <div>Admin Area</div>
      </AuthGuard>,
    );
    expect(screen.getByText("Admin Area")).not.toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("redirects to role route when user role is not allowed", () => {
    mocks.container.authState = { user: { role: "tenant" }, loading: false };
    render(
      <AuthGuard allowedRoles={["admin", "admin"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/tenant");
  });
});
