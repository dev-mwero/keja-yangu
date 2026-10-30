"use client";

import { useState } from "react";
import { useCaretakerMutations } from "@/hooks/use-caretakers";
import { useCustodianMutations } from "@/hooks/use-custodians";

export type TeamInviteRole = "custodian" | "caretaker";

export interface TeamInviteInput {
  role: TeamInviteRole;
  name?: string;
  email?: string;
  phone?: string;
  ownerId?: string;
}

export interface TeamInviteResult {
  /** One-time password for a phone-only account. */
  temporaryPassword?: string;
}

export function useTeamInvites() {
  const { inviteCustodian, pending: custodianPending } = useCustodianMutations();
  const { inviteCaretaker, pending: caretakerPending } = useCaretakerMutations();
  const [error, setError] = useState<string | null>(null);

  const inviteMember = async (input: TeamInviteInput): Promise<TeamInviteResult> => {
    setError(null);
    const { role, ...contact } = input;
    try {
      const result =
        role === "custodian" ? await inviteCustodian(contact) : await inviteCaretaker(contact);
      return { temporaryPassword: result.temporaryPassword };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
      throw err;
    }
  };

  return {
    inviteMember,
    pending: custodianPending || caretakerPending,
    error,
  };
}
