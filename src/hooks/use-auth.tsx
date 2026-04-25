import { createContext, ReactNode, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

export type Role = "tenant" | "caretaker" | "owner";

export interface KejaUser {
  email: string;
  name?: string;
  role: Role;
}

interface AuthContextValue {
  user: KejaUser | null;
  loading: boolean;
  refreshFailed: boolean;
  signIn: (user: KejaUser) => void;
  signOut: () => void;
}

const STORAGE_KEY = "keja-user";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface ReadResult {
  ok: boolean;
  user: KejaUser | null;
  error: string | null;
}

const readStored = (): ReadResult => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ok: true, user: null, error: null };
    const parsed = JSON.parse(raw) as KejaUser;
    if (!parsed?.email || !["tenant", "caretaker", "owner"].includes(parsed.role)) {
      return { ok: false, user: null, error: "Stored session is invalid or corrupted." };
    }
    return { ok: true, user: parsed, error: null };
  } catch (e) {
    return { ok: false, user: null, error: e instanceof Error ? e.message : "Unable to read session." };
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<KejaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refresh = useCallback((opts?: { signalFailureIfMissing?: boolean }) => {
    const result = readStored();
    if (!result.ok) {
      const errorMessage = result.error ?? "Unable to read session.";
      setUser(null);
      setRefreshFailed(true);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      toast.error("Session refresh failed", {
        description: `${errorMessage} Please sign in again.`,
      });
      return;
    }
    if (!result.user && opts?.signalFailureIfMissing) {
      // Session disappeared (e.g. cleared in another tab) while we had a user
      setUser(null);
      setRefreshFailed(true);
      toast.error("Session refresh failed", {
        description: "Your session has expired. Please sign in again.",
      });
      return;
    }
    setUser(result.user);
    setRefreshFailed(false);
  }, []);

  useEffect(() => {
    refresh();
    setLoading(false);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      // If the value was removed or invalidated externally while we had a user, treat as failure
      const hadUser = !!user;
      refresh({ signalFailureIfMissing: hadUser });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh, user]);

  const signIn = useCallback((next: KejaUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setUser(next);
    setRefreshFailed(false);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
    setRefreshFailed(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refreshFailed, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
