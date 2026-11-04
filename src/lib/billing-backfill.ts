export interface BackfillOwner {
  _id: string;
  name?: string;
  role?: string;
}

export interface BackfillUnit {
  _id: string;
  propertyId?: string;
  ownerId?: string;
  billingAccountId?: string;
}

export interface BackfillLease {
  _id: string;
  unitId?: string;
  ownerId?: string;
  billingAccountId?: string;
}

export interface BackfillInvoice {
  _id: string;
  leaseId?: string;
  unitId?: string;
  ownerId?: string;
  billingAccountId?: string;
}

export interface BackfillPayment {
  _id: string;
  invoiceId?: string;
  ownerId?: string;
  billingAccountId?: string;
}

export interface BackfillBillingAccount {
  _id: string;
  ownerAdminId?: string;
  invoicePrefix?: string;
  status?: string;
}

export interface BackfillUnitBillingAssignment {
  unitId?: string;
  billingAccountId?: string;
  status?: string;
}

export interface PlannedBillingAccount {
  ownerAdminId: string;
  legalEntityName: string;
  invoicePrefix: string;
  legacyOwnerId: string;
}

export interface PlannedUnitBillingAssignment {
  unitId: string;
  ownerAdminId?: string;
  billingAccountId?: string;
  reason: string;
}

export interface PlannedUnitPointerUpdate {
  unitId: string;
  ownerAdminId?: string;
  billingAccountId?: string;
}

export interface BillingBackfillPlan {
  billingAccounts: PlannedBillingAccount[];
  unitAssignments: PlannedUnitBillingAssignment[];
  unitPointerUpdates: PlannedUnitPointerUpdate[];
  leaseUpdates: Array<{ leaseId: string; ownerAdminId: string }>;
  invoiceUpdates: Array<{ invoiceId: string; ownerAdminId: string }>;
  paymentUpdates: Array<{ paymentId: string; ownerAdminId: string }>;
  warnings: string[];
}

export function planBillingBackfill(input: {
  owners: BackfillOwner[];
  units: BackfillUnit[];
  leases: BackfillLease[];
  invoices: BackfillInvoice[];
  payments: BackfillPayment[];
  billingAccounts?: BackfillBillingAccount[];
  assignments?: BackfillUnitBillingAssignment[];
}): BillingBackfillPlan {
  const warnings: string[] = [];
  const referencedOwnerIds = new Set<string>();

  for (const u of input.units) {
    if (u.ownerId) referencedOwnerIds.add(u.ownerId);
    else warnings.push(`Unit ${u._id} has no ownerId`);
  }
  for (const l of input.leases) {
    if (l.ownerId) referencedOwnerIds.add(l.ownerId);
  }
  for (const inv of input.invoices) {
    if (inv.ownerId) referencedOwnerIds.add(inv.ownerId);
  }
  for (const p of input.payments) {
    if (p.ownerId) referencedOwnerIds.add(p.ownerId);
  }

  const ownerMap = new Map<string, BackfillOwner>();
  for (const o of input.owners) {
    ownerMap.set(String(o._id), o);
  }

  const existingAccountByOwner = new Map<string, BackfillBillingAccount>();
  const usedPrefixes = new Set<string>();
  for (const account of input.billingAccounts ?? []) {
    if (account.status && account.status !== "active") continue;
    if (account.invoicePrefix) usedPrefixes.add(account.invoicePrefix.toUpperCase());
    if (account.ownerAdminId && !existingAccountByOwner.has(account.ownerAdminId)) {
      existingAccountByOwner.set(account.ownerAdminId, account);
    }
  }

  const sortedOwnerIds = [...referencedOwnerIds].sort();
  const billingAccounts: PlannedBillingAccount[] = [];

  sortedOwnerIds.forEach((ownerId, idx) => {
    if (existingAccountByOwner.has(ownerId)) return;
    const ownerDoc = ownerMap.get(ownerId);
    const legalEntityName = ownerDoc?.name?.trim() || `Property Owner ${idx + 1}`;
    const basePrefix = idx === 0 ? "INV" : `INV${idx + 1}`;
    let invoicePrefix = basePrefix;
    let suffix = 1;
    while (usedPrefixes.has(invoicePrefix)) {
      invoicePrefix = `${basePrefix}X${suffix}`;
      suffix += 1;
    }
    usedPrefixes.add(invoicePrefix);

    billingAccounts.push({
      ownerAdminId: ownerId,
      legalEntityName,
      invoicePrefix,
      legacyOwnerId: ownerId,
    });
  });

  const activeAssignmentByUnit = new Map<string, string>();
  for (const assignment of input.assignments ?? []) {
    if (assignment.status && assignment.status !== "active") continue;
    if (assignment.unitId && assignment.billingAccountId) {
      activeAssignmentByUnit.set(String(assignment.unitId), assignment.billingAccountId);
    }
  }

  const unitAssignments: PlannedUnitBillingAssignment[] = [];
  const unitPointerUpdates: PlannedUnitPointerUpdate[] = [];

  for (const u of input.units) {
    const unitId = String(u._id);
    const assignedAccountId = activeAssignmentByUnit.get(unitId);

    if (assignedAccountId) {
      if (u.billingAccountId && u.billingAccountId !== assignedAccountId) {
        warnings.push(
          `Unit ${unitId} pointer ${u.billingAccountId} differs from active assignment ${assignedAccountId}`,
        );
        unitPointerUpdates.push({ unitId, billingAccountId: assignedAccountId });
      } else if (!u.billingAccountId) {
        unitPointerUpdates.push({ unitId, billingAccountId: assignedAccountId });
      }
      continue;
    }

    if (u.billingAccountId) {
      unitAssignments.push({
        unitId,
        billingAccountId: u.billingAccountId,
        reason: "Reconcile existing unit billing pointer",
      });
      continue;
    }

    if (u.ownerId) {
      unitAssignments.push({
        unitId,
        ownerAdminId: u.ownerId,
        reason: "Phase 3 initial backfill from legacy owner",
      });
      unitPointerUpdates.push({ unitId, ownerAdminId: u.ownerId });
    }
  }

  const leaseUpdates: Array<{ leaseId: string; ownerAdminId: string }> = [];
  for (const l of input.leases) {
    if (l.ownerId && referencedOwnerIds.has(l.ownerId) && !l.billingAccountId) {
      leaseUpdates.push({
        leaseId: String(l._id),
        ownerAdminId: l.ownerId,
      });
    }
  }

  const invoiceUpdates: Array<{ invoiceId: string; ownerAdminId: string }> = [];
  for (const inv of input.invoices) {
    if (inv.ownerId && referencedOwnerIds.has(inv.ownerId) && !inv.billingAccountId) {
      invoiceUpdates.push({
        invoiceId: String(inv._id),
        ownerAdminId: inv.ownerId,
      });
    }
  }

  const paymentUpdates: Array<{ paymentId: string; ownerAdminId: string }> = [];
  for (const p of input.payments) {
    if (p.ownerId && referencedOwnerIds.has(p.ownerId) && !p.billingAccountId) {
      paymentUpdates.push({
        paymentId: String(p._id),
        ownerAdminId: p.ownerId,
      });
    }
  }

  return {
    billingAccounts,
    unitAssignments,
    unitPointerUpdates,
    leaseUpdates,
    invoiceUpdates,
    paymentUpdates,
    warnings,
  };
}
