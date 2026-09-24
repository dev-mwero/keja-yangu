"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

export type Role = "tenant" | "caretaker" | "owner" | "system-admin";

export interface KejaUser {
  id: string;
  email: string;
  name?: string;
  role: Role;
  privileges?: string[];
  managedByOwnerId?: string;
}

interface AuthContextValue {
  user: KejaUser | null;
  loading: boolean;
  refreshFailed: boolean;
  signIn: (email: string, password: string) => Promise<KejaUser>;
  signUp: (name: string, email: string, password: string, role: Role) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<KejaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        setRefreshFailed(true);
        toast.error("Session expired", { description: "Please sign in again." });
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setRefreshFailed(false);
    } catch {
      setUser(null);
      setRefreshFailed(true);
    } finally {
      setLoading(false);
    }
    // biome-ignore lint/correctness: useExhaustiveDependencies
  }, [setUser, setRefreshFailed, setLoading, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signIn = async (email: string, password: string): Promise<KejaUser> => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signin", email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sign in failed");
      }
      const data = await res.json();
      const signedInUser = data.user as KejaUser;
      setUser(signedInUser);
      toast.success("Welcome back!");
      return signedInUser;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      toast.error("Sign in failed", { description: message });
      throw err;
    }
  };

  const signUp = async (name: string, email: string, password: string, role: Role) => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "signup", name, email, password, role }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Sign up failed");
      }
      toast.success("Account created!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      toast.error("Sign up failed", { description: message });
      throw err;
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend-verification", email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to resend verification email");
      }
      toast.success("Verification email sent");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to resend verification email";
      toast.error("Resend failed", { description: message });
      throw err;
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "GET" });
    } catch {
      /* ignore */
    } finally {
      setUser(null);
      setRefreshFailed(false);
      toast.success("Signed out successfully");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, refreshFailed, signIn, signUp, resendVerification, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
