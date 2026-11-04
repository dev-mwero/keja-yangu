import { isValidE164 } from "@/lib/phone";

export interface ProfileCompletenessCandidate {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  nationalId?: string | null;
}

/**
 * Checks whether a user account has filled in essential profile fields:
 * - A real name (non-empty, and not simply matching the email address)
 * - A valid mobile phone in E.164 format
 * - A non-empty national ID
 */
export function isProfileComplete(user: ProfileCompletenessCandidate | null | undefined): boolean {
  if (!user) return false;

  const name = user.name?.trim() ?? "";
  const email = user.email?.trim().toLowerCase() ?? "";
  if (!name || (email && name.toLowerCase() === email)) {
    return false;
  }

  const phone = user.phone?.trim() ?? "";
  if (!phone || !isValidE164(phone)) {
    return false;
  }

  const nationalId = user.nationalId?.trim() ?? "";
  if (!nationalId) {
    return false;
  }

  return true;
}
