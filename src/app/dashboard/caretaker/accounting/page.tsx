"use client";

import { Lock } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { InvoicesManager } from "@/components/invoices/InvoicesManager";
import { useAuth } from "@/hooks/use-auth";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";

const CaretakerAccountingPage = () => {
  const nav = useCaretakerNav();
  const { user } = useAuth();
  const privileged = user?.privileges?.includes("manage_invoices") ?? false;

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Accounting"
      subtitle="Track rent collection for the tenants you manage."
    >
      {privileged ? (
        <InvoicesManager nav={nav} roleName="Caretaker" canManage isStaffScope />
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-xl">Invoicing is locked</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Your account does not have the manage invoices privilege. Ask your landlord to enable it
            in Team settings.
          </p>
        </div>
      )}
    </DashboardShell>
  );
};

export default CaretakerAccountingPage;
