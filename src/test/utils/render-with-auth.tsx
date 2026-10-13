import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import type { KejaUser, Role } from "@/hooks/use-auth";

export interface AuthMockValue {
  user: KejaUser | null;
  loading: boolean;
  signUp: (
    name: string,
    email: string,
    password: string,
    role: Role,
    details: { phone: string; nationalId: string },
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<KejaUser>;
  resendVerification: (email: string) => Promise<void>;
  updateProfile: (patch: unknown) => Promise<boolean>;
  signOut: () => void;
}

export const createAuthMock = (overrides: Partial<AuthMockValue> = {}): AuthMockValue => ({
  user: null,
  loading: false,
  signUp: () => Promise.resolve(),
  signIn: () => Promise.reject(new Error("not implemented")),
  resendVerification: () => Promise.resolve(),
  updateProfile: () => Promise.resolve(false),
  signOut: () => {},
  ...overrides,
});

/**
 * Mutable holder wired to `vi.mock("@/hooks/use-auth")` factories in
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
