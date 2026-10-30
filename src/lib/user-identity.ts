import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@/lib/permissions";
import { isValidE164, normalizeStoredPhone } from "@/lib/phone";
import { User } from "@/models/User";

export function normalizeContactEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeContactPhone(value?: string | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  const normalized = normalizeStoredPhone(trimmed);
  return isValidE164(normalized) ? normalized : "";
}

export type IdentityConflictKind = "missing-contact" | "invalid-phone" | "identity-conflict";

export interface IdentityConflict {
  kind: IdentityConflictKind;
  message: string;
}

export interface ContactIdentity {
  email: string;
  phone: string;
}

export interface ResolvedContactUser {
  _id?: unknown;
  id?: string;
  email?: string;
  phone?: string;
  role?: Role;
  isActive?: boolean;
  isVerified?: boolean;
  managedByOwnerId?: string;
}

export interface ResolveContactInput {
  email?: string | null;
  phone?: string | null;
}

export type ResolveContactResult =
  | ({ ok: true; user: ResolvedContactUser | null } & ContactIdentity)
  | ({ ok: false; user?: undefined } & IdentityConflict & ContactIdentity);

export async function resolveUserByContact(
  input: ResolveContactInput,
): Promise<ResolveContactResult> {
  const email = normalizeContactEmail(input.email);
  const rawPhone = (input.phone ?? "").trim();
  const phone = normalizeContactPhone(rawPhone);

  if (!email && !rawPhone) {
    return {
      ok: false,
      email,
      phone,
      kind: "missing-contact",
      message: "Email or phone is required",
    };
  }
  if (rawPhone && !phone) {
    return {
      ok: false,
      email,
      phone,
      kind: "invalid-phone",
      message: "Enter a valid mobile number with its country code",
    };
  }

  const [byEmail, byPhone] = await Promise.all([
    email ? User.findOne({ email }).lean() : Promise.resolve(null),
    phone ? User.findOne({ phone }).lean() : Promise.resolve(null),
  ]);

  if (
    byEmail &&
    byPhone &&
    String((byEmail as ResolvedContactUser)._id ?? "") !==
      String((byPhone as ResolvedContactUser)._id ?? "")
  ) {
    return {
      ok: false,
      email,
      phone,
      kind: "identity-conflict",
      message: "Email and phone belong to different accounts",
    };
  }

  return {
    ok: true,
    email,
    phone,
    user: (byEmail ?? byPhone ?? null) as ResolvedContactUser | null,
  };
}

export interface CreatePhoneOnlyAccountInput {
  role: Role;
  name: string;
  phone: string;
  managedByOwnerId?: string;
  privileges?: string[];
}

export async function createPhoneOnlyAccount(input: CreatePhoneOnlyAccountInput) {
  const phone = normalizeContactPhone(input.phone);
  if (!phone) {
    throw new Error("A valid E.164 phone number is required");
  }

  const plainPassword = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await bcrypt.hash(plainPassword, 12);
  const user = await User.create({
    email: undefined,
    name: input.name.trim(),
    phone,
    passwordHash,
    role: input.role,
    isActive: true,
    isVerified: true,
    managedByOwnerId: input.managedByOwnerId ?? "",
    privileges: input.privileges ?? [],
  });

  return { user, password: plainPassword };
}
