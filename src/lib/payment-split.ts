/**
 * Splits a collected payment amount (minor units) into the rent portion
 * (→ owner) and the service-charge portion (→ caretaker).
 *
 * - When rent does NOT include the service charge, the whole amount is rent
 *   (the service charge is billed/paid separately).
 * - When rent INCLUDES the service charge, the amount is split by the
 *   configured percentages. `serviceChargeMinor` is derived as the remainder
 *   so the two parts always sum exactly to the collected total, avoiding
 *   rounding drift where independently rounded shares would not.
 */
export interface PaymentSplitResult {
  rentMinor: number;
  serviceChargeMinor: number;
}

export interface PaymentSplitUnit {
  rentIncludesServiceCharge: boolean;
  rentSharePercent: number;
  serviceChargeSharePercent: number;
}

export function computePaymentSplit(
  unit: PaymentSplitUnit,
  amountMinor: number,
): PaymentSplitResult {
  if (!unit.rentIncludesServiceCharge) {
    return { rentMinor: amountMinor, serviceChargeMinor: 0 };
  }

  const rentMinor = Math.round((amountMinor * unit.rentSharePercent) / 100);
  const serviceChargeMinor = amountMinor - rentMinor;
  return { rentMinor, serviceChargeMinor };
}

export interface PaymentSplitInvoice {
  amountDue: number;
  rentAmount?: number | null;
  serviceChargeAmount?: number | null;
  rentIncludesServiceCharge?: boolean | null;
}

/**
 * Splits a collected amount using the invoice's immutable billing snapshot.
 * Full settlement follows the snapshot exactly; partial payments allocate the
 * service fee pro-rata and put any rounding remainder on rent so the parts
 * always sum to the collected total.
 */
export function computeInvoicePaymentSplit(
  invoice: PaymentSplitInvoice,
  amountMinor: number,
): PaymentSplitResult {
  const serviceFee = Math.max(0, invoice.serviceChargeAmount ?? 0);
  if (serviceFee <= 0) {
    return { rentMinor: amountMinor, serviceChargeMinor: 0 };
  }

  const total = Math.max(invoice.amountDue, invoice.rentAmount ?? 0, serviceFee);
  if (total <= 0) {
    return { rentMinor: amountMinor, serviceChargeMinor: 0 };
  }

  if (amountMinor >= Math.round(total * 100)) {
    const serviceChargeMinor = Math.round(serviceFee * 100);
    return {
      rentMinor: amountMinor - serviceChargeMinor,
      serviceChargeMinor,
    };
  }

  const serviceChargeMinor = Math.round((amountMinor * serviceFee) / total);
  return {
    rentMinor: amountMinor - serviceChargeMinor,
    serviceChargeMinor,
  };
}
