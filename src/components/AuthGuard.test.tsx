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
      <AuthGuard allowedRoles={["owner"]}>
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
      <AuthGuard allowedRoles={["owner"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(mocks.router.push).toHaveBeenCalledWith("/auth");
  });

  it("renders children when user role is in allowedRoles", () => {
    mocks.container.authState = { user: { role: "owner" }, loading: false };
    render(
      <AuthGuard allowedRoles={["owner", "admin"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.getByText("Protected Content")).not.toBeNull();
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("redirects to role route when user role is not allowed", () => {
    mocks.container.authState = { user: { role: "tenant" }, loading: false };
    render(
      <AuthGuard allowedRoles={["owner", "admin"]}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/tenant");
  });

  it("denies access when allowedRoles is undefined (unknown route)", () => {
    mocks.container.authState = { user: { role: "owner" }, loading: false };
    render(
      <AuthGuard allowedRoles={undefined}>
        <div>Protected Content</div>
      </AuthGuard>,
    );
    expect(screen.queryByText("Protected Content")).toBeNull();
    expect(mocks.router.push).toHaveBeenCalledWith("/dashboard/owner");
  });
});
