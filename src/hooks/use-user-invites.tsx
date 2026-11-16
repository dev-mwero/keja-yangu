"use client";

import { useCallback, useState } from "react";

export interface UserInviteInput {
  role: string;
  name?: string;
  email?: string;
  phone?: string;
  privileges?: string[];
  ownerId?: string;
}

export interface UserInviteResult {
  invited?: boolean;
  created?: boolean;
  temporaryPassword?: string;
  data?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  };
}

export function useUserInvites() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteUser = useCallback(async (input: UserInviteInput): Promise<UserInviteResult> => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = json.error || "Failed to create user";
        setError(message);
        throw new Error(message);
      }
      return json as UserInviteResult;
    } finally {
      setPending(false);
    }
  }, []);

  return { inviteUser, pending, error };
}
