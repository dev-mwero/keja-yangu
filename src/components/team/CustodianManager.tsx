"use client";

import { Loader2, Plus, UserCog } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCustodianMutations, useCustodians } from "@/hooks/use-custodians";

interface Props {
  systemAdmin?: boolean;
}

export const CustodianManager = ({ systemAdmin = false }: Props) => {
  const { custodians, loading, error, refetch } = useCustodians();
  const { inviteCustodian, revokeCustodian, pending } = useCustodianMutations();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const resetForm = () => {
    setEmail("");
    setName("");
    setPhone("");
    setOwnerId("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required");
      return;
    }
    if (systemAdmin && !ownerId.trim()) {
      toast.error("Owner id is required");
      return;
    }
    try {
      await inviteCustodian({
        email: email.trim(),
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        ownerId: systemAdmin ? ownerId.trim() : undefined,
      });
      toast.success("Custodian invited", {
        description: "They will receive an email to activate their account.",
      });
      resetForm();
      setOpen(false);
      refetch();
    } catch (err) {
      toast.error("Could not invite custodian", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const revoke = async (id: string, custodianName: string) => {
    try {
      await revokeCustodian(id);
      toast.success(`${custodianName}'s access revoked`);
      refetch();
    } catch (err) {
      toast.error("Could not revoke custodian", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg">Custodians</h3>
          <p className="text-sm text-muted-foreground">
            Custodians manage your portfolio on your behalf, scoped to your account.
          </p>
        </div>
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Invite custodian
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading custodians…</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : custodians.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <UserCog className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <h3 className="font-display text-xl">No custodians yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite a custodian to help manage your portfolio.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {custodians.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={pending}
                      onClick={() => revoke(c.id, c.name)}
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite custodian</DialogTitle>
            <DialogDescription>
              They will receive an email invite and can activate their account with the same email
              address.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="custodian-email">Email</Label>
              <Input
                id="custodian-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="custodian@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custodian-name">Name</Label>
              <Input
                id="custodian-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custodian-phone">Phone</Label>
              <Input
                id="custodian-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
            {systemAdmin && (
              <div className="space-y-2">
                <Label htmlFor="custodian-owner">Owner id</Label>
                <Input
                  id="custodian-owner"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  placeholder="24-hex owner user id"
                />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-full" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
