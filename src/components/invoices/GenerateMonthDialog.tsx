"use client";

import { CalendarPlus, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { formatPeriod } from "@/lib/format";
import { currentPeriod, PERIOD_REGEX } from "@/lib/invoicing";

interface GenerateMonthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (period: string) => Promise<{ created: number; skipped: number }>;
}

export const GenerateMonthDialog = ({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: GenerateMonthDialogProps) => {
  const [period, setPeriod] = useState(currentPeriod());
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!PERIOD_REGEX.test(period)) {
      setError("Period must match YYYY-MM, e.g. 2026-09.");
      return;
    }
    setError(null);
    try {
      await onSubmit(period);
    } catch {
      // the parent has already surfaced the failure via toast
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate month</DialogTitle>
          <DialogDescription>
            Creates one invoice per active lease for the chosen month. Re-running a month is safe —
            already-billed leases are skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="generate-period">Billing period</Label>
          <Input
            id="generate-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="YYYY-MM"
          />
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Defaults to {formatPeriod(currentPeriod())}. Future months are rejected by the server.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-full"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button className="rounded-full" disabled={pending} onClick={handleSubmit}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
