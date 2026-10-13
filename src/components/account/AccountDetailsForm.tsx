"use client";

import { KeyRound, LogOut, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { KejaUser, ProfilePatch } from "@/hooks/use-auth";
import { COUNTRIES, DEFAULT_COUNTRY, normalizeNationalId, parsePhone, toE164 } from "@/lib/phone";

interface AccountDetailsFormProps {
  user: KejaUser | null;
  onSave: (patch: ProfilePatch) => Promise<boolean>;
  onSignOut: () => void;
}

const CountrySelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (dial: string) => void;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="w-32 shrink-0" aria-label="Country code">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {COUNTRIES.map((country) => (
        <SelectItem key={country.code} value={country.dial}>
          {country.code} {country.dial}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Editable contact + identity details for the signed-in account: mobile number
 * (with country code), an optional separate WhatsApp number, and a national ID.
 */
export const AccountDetailsForm = ({ user, onSave, onSignOut }: AccountDetailsFormProps) => {
  const [name, setName] = useState(user?.name ?? "");
  const [dial, setDial] = useState(DEFAULT_COUNTRY.dial);
  const [national, setNational] = useState("");
  const [sameWhatsapp, setSameWhatsapp] = useState(true);
  const [waDial, setWaDial] = useState(DEFAULT_COUNTRY.dial);
  const [waNational, setWaNational] = useState("");
  const [nationalId, setNationalId] = useState(user?.nationalId ?? "");
  const [saving, setSaving] = useState(false);

  // Re-seed the fields whenever the underlying account changes (initial load,
  // or right after a save refreshes the auth context).
  useEffect(() => {
    if (!user) return;
    const phone = parsePhone(user.phone ?? "");
    const whatsapp = parsePhone(user.whatsapp ?? "");
    setName(user.name ?? "");
    setNationalId(user.nationalId ?? "");
    setDial(phone?.country.dial ?? DEFAULT_COUNTRY.dial);
    setNational(phone?.national ?? "");
    setSameWhatsapp(!user.whatsapp);
    setWaDial(whatsapp?.country.dial ?? phone?.country.dial ?? DEFAULT_COUNTRY.dial);
    setWaNational(whatsapp?.national ?? "");
  }, [user]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        phone: toE164(dial, national),
        whatsapp: sameWhatsapp ? "" : toE164(waDial, waNational),
        nationalId: normalizeNationalId(nationalId),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contact-email">Contact email</Label>
        <Input id="contact-email" value={user?.email ?? ""} disabled />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="profile-mobile">Mobile number</Label>
        <div className="flex gap-2">
          <CountrySelect value={dial} onChange={setDial} />
          <Input
            id="profile-mobile"
            inputMode="tel"
            placeholder="712 345 678"
            value={national}
            onChange={(event) => setNational(event.target.value)}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Include the country code — it is selected for you and saved with the number.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="whatsapp-same">WhatsApp is the same as mobile</Label>
          <Switch id="whatsapp-same" checked={sameWhatsapp} onCheckedChange={setSameWhatsapp} />
        </div>
        {!sameWhatsapp && (
          <div className="flex gap-2">
            <CountrySelect value={waDial} onChange={setWaDial} />
            <Input
              aria-label="WhatsApp number"
              inputMode="tel"
              placeholder="712 345 678"
              value={waNational}
              onChange={(event) => setWaNational(event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="national-id">National ID number</Label>
        <Input
          id="national-id"
          value={nationalId}
          onChange={(event) => setNationalId(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Your ID is private to your account and never shown to other users.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" className="rounded-full" disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Link href="/auth/forgot-password">
          <Button type="button" variant="outline" className="rounded-full">
            <KeyRound className="h-4 w-4" />
            Reset password
          </Button>
        </Link>
        <Button
          type="button"
          variant="outline"
          className="rounded-full text-destructive hover:text-destructive"
          onClick={onSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </form>
  );
};
