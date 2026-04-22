import { createContext, ReactNode, useContext, useEffect, useState, useCallback } from "react";

export type Role = "tenant" | "caretaker" | "owner";

export interface KejaUser {
  email: string;
  name?: string;
  role: Role;
}

interface AuthContextValue {
  user: KejaUser | null;
  loading: boolean;
  signIn: (user: KejaUser) => void;
  signOut: () => void;
}

const STORAGE_KEY = "keja-user";
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStored = (): KejaUser | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KejaUser;
    if (!parsed?.email || !["tenant", "caretaker", "owner"].includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<KejaUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(readStored());
    setLoading(false);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setUser(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback((next: KejaUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setUser(next);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
