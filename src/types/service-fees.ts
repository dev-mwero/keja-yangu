export type ServiceFeeAppliesTo = "all" | "selected";

export interface ServiceFeeItem {
  _id: string;
  ownerId: string;
  propertyId: string;
  label: string;
  amount: number;
  active: boolean;
  sortOrder: number;
  appliesTo: ServiceFeeAppliesTo;
  unitIds: string[];
}

export interface ServiceFeeOverride {
  _id?: string;
  itemId: string;
  unitId: string;
  amount?: number | null;
  active?: boolean | null;
}

export interface ServiceFeeBreakdownItem {
  itemId: string;
  label: string;
  amount: number;
}

export interface ResolvedServiceFee {
  total: number;
  breakdown: ServiceFeeBreakdownItem[];
  rentIncludesServiceCharge?: boolean;
  rentSharePercent?: number;
  serviceChargeSharePercent?: number;
}
