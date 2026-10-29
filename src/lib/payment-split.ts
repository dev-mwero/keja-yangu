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
