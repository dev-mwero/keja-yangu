import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { KejaUser } from "@/hooks/use-auth";

export interface AuthMockValue {
  user: KejaUser | null;
  loading: boolean;
  refreshFailed: boolean;
  signIn: () => Promise<KejaUser>;
  signUp: () => Promise<void>;
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
}

export function createAuthMock(value: Partial<AuthMockValue> = {}): AuthMockValue {
  return {
    user: null,
    loading: false,
    refreshFailed: false,
    signIn: () => Promise.resolve({ id: "", email: "", role: "tenant" }),
    signUp: () => Promise.resolve(),
    resendVerification: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    ...value,
  };
}

/**
 * Mutable holder wired into `vi.mock("@/hooks/use-auth")` factories in
 * component tests that need an authenticated viewer. Mirror of the setup.ts
 * `useAuth` default mock; override per file:
 *
 *     const authMock = createAuthMock();
 *     vi.mock("@/hooks/use-auth", () => ({ useAuth: () => authMock }));
 */
export const authMock = createAuthMock();

export function mockUseAuth(user: KejaUser | null): AuthMockValue {
  authMock.user = user;
  authMock.loading = false;
  return authMock;
}

export function renderWithAuth(ui: ReactElement) {
  return render(ui);
}
