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

export interface PlannedBillingAccount {
  ownerAdminId: string;
  legalEntityName: string;
  invoicePrefix: string;
  legacyOwnerId: string;
}

export interface PlannedUnitBillingAssignment {
  unitId: string;
  ownerAdminId: string;
  reason: string;
}

export interface BillingBackfillPlan {
  billingAccounts: PlannedBillingAccount[];
  unitAssignments: PlannedUnitBillingAssignment[];
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

  const sortedOwnerIds = [...referencedOwnerIds].sort();
  const billingAccounts: PlannedBillingAccount[] = [];

  sortedOwnerIds.forEach((ownerId, idx) => {
    const ownerDoc = ownerMap.get(ownerId);
    const legalEntityName = ownerDoc?.name?.trim() || `Property Owner ${idx + 1}`;
    const invoicePrefix = idx === 0 ? "INV" : `INV${idx + 1}`;

    billingAccounts.push({
      ownerAdminId: ownerId,
      legalEntityName,
      invoicePrefix,
      legacyOwnerId: ownerId,
    });
  });

  const unitAssignments: PlannedUnitBillingAssignment[] = [];
  for (const u of input.units) {
    if (u.ownerId && referencedOwnerIds.has(u.ownerId)) {
      unitAssignments.push({
        unitId: String(u._id),
        ownerAdminId: u.ownerId,
        reason: "Phase 3 initial backfill from legacy owner",
      });
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
    leaseUpdates,
    invoiceUpdates,
    paymentUpdates,
    warnings,
  };
}
