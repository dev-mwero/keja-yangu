"use client";

import { Copy, Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CountryCodeSelect } from "@/components/account/CountryCodeSelect";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserInvites } from "@/hooks/use-user-invites";
import { DEFAULT_COUNTRY, formatPhone, isValidE164, toE164 } from "@/lib/phone";

const ROLE_LABELS: Record<string, string> = {
  tenant: "Tenant",
  caretaker: "Caretaker",
  custodian: "Custodian",
  owner: "Owner",
  admin: "Admin",
  broker: "Broker",
};

const ALL_ROLES = ["tenant", "caretaker", "custodian", "owner", "admin", "broker"];

export const UserInviteCard = ({ onCreated }: { onCreated?: () => void } = {}) => {
  const { inviteUser, pending } = useUserInvites();
  const [role, setRole] = useState("tenant");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nationalPhone, setNationalPhone] = useState("");
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);
  const [ownerId, setOwnerId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{ phone: string; password: string } | null>(null);

  const phone = nationalPhone.trim() ? toE164(dial, nationalPhone) : "";
  const trimmedEmail = email.trim().toLowerCase();

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!trimmedEmail && !phone) {
      next.email = "Provide an email or phone";
    } else if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = "Enter a valid email";
    }
    if (nationalPhone.trim() && !isValidE164(phone)) {
      next.phone = "Enter a valid phone number";
    }
    if ((role === "caretaker" || role === "custodian") && !ownerId.trim()) {
      next.ownerId = "Owner id is required for staff roles";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    try {
      const result = await inviteUser({
        role,
        name: name.trim() || undefined,
        email: trimmedEmail || undefined,
        phone: phone || undefined,
        ownerId: (role === "caretaker" || role === "custodian") ? ownerId.trim() : undefined,
      });

      if (result.created && result.temporaryPassword) {
        setCredentials({ phone: phone || "", password: result.temporaryPassword });
        toast.success("User created", {
          description: "Share the temporary password with them once.",
        });
      } else {
        toast.success("Invitation sent", {
          description: "They will receive an email to activate their account.",
        });
      }
      setName("");
      setEmail("");
      setNationalPhone("");
      setOwnerId("");
      setErrors({});
      onCreated?.();
    } catch (err) {
      toast.error("Could not create user", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-display text-lg">Add a user</h3>
          <p className="text-sm text-muted-foreground">
            Invite by email or phone. Phone-only accounts get a temporary password.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-invite-name">Name</Label>
            <Input
              id="user-invite-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <CountryCodeSelect value={dial} onChange={setDial} />
                <Input
                  aria-label="Phone"
                  id="user-invite-phone"
                  inputMode="tel"
                  placeholder="712 345 678"
                  value={nationalPhone}
                  onChange={(e) => setNationalPhone(e.target.value)}
                />
              </div>
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
          </div>
        </div>

        {(role === "caretaker" || role === "custodian") && (
          <div className="space-y-2">
            <Label htmlFor="user-invite-owner">Owner id</Label>
            <Input
              id="user-invite-owner"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              placeholder="24-hex owner user id"
            />
            {errors.ownerId && <p className="text-xs text-destructive">{errors.ownerId}</p>}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" className="rounded-full" disabled={pending}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            {pending ? "Creating…" : "Add user"}
          </Button>
        </div>
      </form>

      <Dialog open={credentials !== null} onOpenChange={(open) => !open && setCredentials(null)}>
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
