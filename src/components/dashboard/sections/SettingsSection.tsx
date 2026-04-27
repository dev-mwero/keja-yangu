import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";

export const SettingsSection = () => {
  const { user } = useAuth();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-border p-5">
        <h3 className="font-display text-lg font-semibold">Profile</h3>
        <p className="mt-1 text-sm text-muted-foreground">How tenants and teammates see you.</p>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" defaultValue={user?.name ?? ""} placeholder="Your name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue={user?.email ?? ""} />
          </div>
          <Button size="sm">Save changes</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border p-5">
        <h3 className="font-display text-lg font-semibold">Notifications</h3>
        <p className="mt-1 text-sm text-muted-foreground">Choose what we email you about.</p>
        <div className="mt-4 space-y-4">
          <Row label="Maintenance requests" desc="New tickets and status changes" defaultChecked />
          <Row label="Rent payments" desc="Successful and failed transactions" defaultChecked />
          <Row label="Weekly digest" desc="Portfolio summary every Monday" />
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, desc, defaultChecked }: { label: string; desc: string; defaultChecked?: boolean }) => (
  <div className="flex items-center justify-between gap-4">
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
    <Switch defaultChecked={defaultChecked} />
  </div>
);