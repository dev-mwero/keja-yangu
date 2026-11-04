"use client";

import { Copy, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CountryCodeSelect } from "@/components/account/CountryCodeSelect";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type TeamInviteRole, useTeamInvites } from "@/hooks/use-team-invites";
import { DEFAULT_COUNTRY, formatPhone, isValidE164, toE164 } from "@/lib/phone";

const ROLE_LABELS: Record<TeamInviteRole, string> = {
  custodian: "Custodian",
  caretaker: "Caretaker",
};

interface TeamInviteCardProps {
  allowedRoles: TeamInviteRole[];
  /** Shows the owner-id field when a system-admin invites a custodian. */
  systemAdmin?: boolean;
}

interface InviteErrors {
  email?: string;
  phone?: string;
  ownerId?: string;
}

interface ExistingAccountMatch {
  id: string;
  name: string;
  email?: string;
  role: string;
  isActive: boolean;
  hasVerifiedEmail: boolean;
  canLink?: boolean;
  linkReason?: string;
}

export const TeamInviteCard = ({ allowedRoles, systemAdmin = false }: TeamInviteCardProps) => {
  const { inviteMember, pending } = useTeamInvites();
  const [role, setRole] = useState<TeamInviteRole>(allowedRoles[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nationalPhone, setNationalPhone] = useState("");
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);
  const [ownerId, setOwnerId] = useState("");
  const [errors, setErrors] = useState<InviteErrors>({});
  const [credentials, setCredentials] = useState<{ phone: string; password: string } | null>(null);
  const [identityCheck, setIdentityCheck] = useState<{
    key: string;
    match: ExistingAccountMatch | null;
  } | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [checkingIdentity, setCheckingIdentity] = useState(false);

  const phone = nationalPhone.trim() ? toE164(dial, nationalPhone) : "";
  const trimmedEmail = email.trim().toLowerCase();
  const identityKey = [role, trimmedEmail, phone, systemAdmin ? ownerId.trim() : ""].join("|");
  const currentMatch = identityCheck?.key === identityKey ? identityCheck.match : null;

  const resetForm = () => {
    setName("");
    setEmail("");
    setNationalPhone("");
    setDial(DEFAULT_COUNTRY.dial);
    setOwnerId("");
    setErrors({});
    setIdentityCheck(null);
    setIdentityError(null);
  };

  const clearIdentityCheck = () => {
    setIdentityCheck(null);
    setIdentityError(null);
  };

  const validate = (phone: string): boolean => {
    const next: InviteErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail && !phone) {
      next.email = "Provide an email or phone";
    } else if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = "Enter a valid email";
    }
    if (nationalPhone.trim() && !isValidE164(phone)) {
      next.phone = "Enter a valid phone number";
    }
    if (systemAdmin && role === "custodian" && !ownerId.trim()) {
      next.ownerId = "Owner id is required";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate(phone)) return;

    const contactEmail = trimmedEmail || undefined;
    const contactPhone = phone || undefined;
    let existingMatch = currentMatch;
    try {
      if (identityCheck?.key !== identityKey) {
        setCheckingIdentity(true);
        setIdentityError(null);
        const params = new URLSearchParams({
          role,
          ...(contactEmail ? { email: contactEmail } : {}),
          ...(contactPhone ? { phone: contactPhone } : {}),
          ...(systemAdmin && ownerId.trim() ? { ownerId: ownerId.trim() } : {}),
        });
        const response = await fetch(`/api/v1/users/search?${params.toString()}`);
        const body = (await response.json()) as {
          error?: string;
          data?: ExistingAccountMatch[];
        };
        if (!response.ok) {
          throw new Error(body.error || "Could not check for an existing account");
        }
        if (!Array.isArray(body.data)) {
          throw new Error("Could not verify whether this person already has an account");
        }
        existingMatch = body.data[0] ?? null;
        setIdentityCheck({ key: identityKey, match: existingMatch });
        if (existingMatch) {
          if (!existingMatch.canLink) {
            setIdentityError(existingMatch.linkReason || "This existing account cannot be linked.");
          }
          return;
        }
      } else if (existingMatch && !existingMatch.canLink) {
        setIdentityError(existingMatch.linkReason || "This existing account cannot be linked.");
        return;
      }

      const result = await inviteMember({
        role,
        name: name.trim() || undefined,
        email: contactEmail,
        phone: contactPhone,
        ownerId: systemAdmin && role === "custodian" ? ownerId.trim() : undefined,
      });

      if (result.linked) {
        toast.success("Team member linked");
      } else if (contactEmail) {
        toast.success("Invitation sent", {
          description: "They will receive an email to activate their account.",
        });
      } else if (contactPhone && result.temporaryPassword) {
        setCredentials({ phone: contactPhone, password: result.temporaryPassword });
        toast.success("Team member added", {
          description: "Share the temporary password with them once.",
        });
      } else {
        toast.success("Team member linked");
      }
      resetForm();
    } catch (err) {
      toast.error("Could not check or invite team member", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCheckingIdentity(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display text-lg">Invite a team member</h3>
          <p className="text-sm text-muted-foreground">
            Invite by email or phone. Phone-only accounts get a temporary password.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {allowedRoles.length > 1 && (
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  setRole(value as TeamInviteRole);
                  clearIdentityCheck();
                }}
              >
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedRoles.map((allowed) => (
                    <SelectItem key={allowed} value={allowed}>
                      {ROLE_LABELS[allowed]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="team-invite-name">Name</Label>
            <Input
              id="team-invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Email or phone</Label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Input
                aria-label="Email"
                type="email"
                placeholder="teammate@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearIdentityCheck();
                }}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <CountryCodeSelect value={dial} onChange={setDial} />
                <Input
                  aria-label="Phone"
                  id="team-invite-phone"
                  inputMode="tel"
                  placeholder="712 345 678"
                  value={nationalPhone}
                  onChange={(event) => {
                    setNationalPhone(event.target.value);
                    clearIdentityCheck();
                  }}
                />
              </div>
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
          </div>
        </div>

        {systemAdmin && role === "custodian" && (
          <div className="space-y-2">
            <Label htmlFor="team-invite-owner">Owner id</Label>
            <Input
              id="team-invite-owner"
              value={ownerId}
              onChange={(event) => {
                setOwnerId(event.target.value);
                clearIdentityCheck();
              }}
              placeholder="24-hex owner user id"
            />
            {errors.ownerId && <p className="text-xs text-destructive">{errors.ownerId}</p>}
          </div>
        )}

        {currentMatch && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm" role="status">
            <p className="font-medium">
              An existing {ROLE_LABELS[role].toLowerCase()} account was found
            </p>
            <p className="text-muted-foreground">
              {currentMatch.name}
              {currentMatch.email ? ` · ${currentMatch.email}` : ""}
              {currentMatch.isActive && currentMatch.hasVerifiedEmail ? " · Active" : " · Pending"}
            </p>
            {currentMatch.canLink && (
              <p className="mt-1 text-muted-foreground">
                Link this account to your portfolio; no duplicate account will be created.
              </p>
            )}
          </div>
        )}
        {identityError && (
          <p className="text-sm text-destructive" role="alert">
            {identityError}
          </p>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            className="rounded-full"
            disabled={
              pending ||
              checkingIdentity ||
              (currentMatch !== null && currentMatch.canLink === false)
            }
          >
            {pending || checkingIdentity ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            {currentMatch?.canLink ? "Link existing account" : "Check account and continue"}
          </Button>
        </div>
      </form>

      <Dialog
        open={credentials !== null}
        onOpenChange={(open) => {
          if (!open) setCredentials(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              Share these sign-in details with them once. The password cannot be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
              <p className="font-medium">{formatPhone(credentials?.phone ?? "")}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Password</p>
              <p className="break-all font-mono">{credentials?.password}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (!credentials) return;
                void navigator.clipboard?.writeText(credentials.password);
                toast.success("Password copied");
              }}
            >
              <Copy className="h-4 w-4" />
              Copy password
            </Button>
            <Button className="rounded-full" onClick={() => setCredentials(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
