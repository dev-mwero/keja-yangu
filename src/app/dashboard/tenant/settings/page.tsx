"use client";

import { Bell, KeyRound, LogOut, Mail, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
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
import { tenantNav } from "@/config/dashboardNav";
import {
  type StoredSettings,
  settingsStore,
  type UserSettings,
  updateSettings,
} from "@/data/dashboard";
import { useAuth } from "@/hooks/use-auth";
import { useLocalStore } from "@/hooks/use-local-store";

interface SettingsItem {
  key: keyof Pick<
    UserSettings,
    "emailNotifications" | "smsNotifications" | "marketingEmails" | "moderationReminders"
  >;
  label: string;
  description: string;
}

const notificationItems: SettingsItem[] = [
  {
    key: "emailNotifications",
    label: "Email notifications",
    description: "Get payment reminders and property updates by email.",
  },
  {
    key: "smsNotifications",
    label: "SMS notifications",
    description: "Receive urgent alerts, like maintenance visits, via SMS.",
  },
  {
    key: "marketingEmails",
    label: "Marketing emails",
    description: "Let us send you occasional offers and new listings.",
  },
  {
    key: "moderationReminders",
    label: "Complaint updates",
    description: "Notify me when a complaint I've logged changes status.",
  },
];

const TenantSettingsPage = () => {
  const { user, signOut } = useAuth();
  const { items, setItems } = useLocalStore<StoredSettings>(settingsStore);
  const prefs = items[0] ?? settingsStore.readAll()[0];

  const setPref = (patch: Partial<UserSettings>) => {
    updateSettings(settingsStore, patch);
    setItems(settingsStore.readAll());
    toast.info("Preferences saved");
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Settings"
      subtitle="Manage your account and notification preferences."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Profile</h2>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 font-display text-xl font-semibold text-primary">
              {(user?.name ?? "T").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="font-display text-lg font-semibold">{user?.name ?? "Tenant"}</p>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium capitalize text-primary">
                {user?.role}
              </span>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Display name</Label>
              <Input id="display-name" defaultValue={user?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Contact email</Label>
              <Input id="contact-email" defaultValue={user?.email ?? ""} disabled />
            </div>
            <div className="flex gap-2 pt-1">
              <Link href="/auth/forgot-password">
                <Button variant="outline" className="rounded-full">
                  <KeyRound className="h-4 w-4" />
                  Reset password
                </Button>
              </Link>
              <Button
                variant="outline"
                className="rounded-full text-destructive hover:text-destructive"
                onClick={signOut}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="font-display text-lg font-semibold">Notifications</h2>
          </div>
          <div className="mt-4 space-y-4">
            {notificationItems.map((item) => (
              <div key={item.key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <Switch
                  checked={Boolean(prefs?.[item.key])}
                  onCheckedChange={(value) => setPref({ [item.key]: value })}
                />
              </div>
            ))}
            <div className="space-y-1.5 border-t border-border pt-4">
              <div className="text-sm font-medium text-muted-foreground">Language</div>
              <Select
                value={prefs?.language ?? "en"}
                onValueChange={(value) => setPref({ language: value })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="sw">Kiswahili</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        <Mail className="h-4 w-4" />
        Verification and password emails come from keja.support@d8tatechsolutions.com. Check spam if
        you don&apos;t see them.
      </div>
    </DashboardShell>
  );
};

export default TenantSettingsPage;
