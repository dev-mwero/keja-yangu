import { z } from "zod";
import { PROPERTY_PURPOSES, UNIT_STATUSES } from "@/lib/domain-enums";

export const unitUpdateInput = z
  .object({
    status: z.enum(UNIT_STATUSES).optional(),
    purpose: z.enum(PROPERTY_PURPOSES).nullable().optional(),
    rent: z.coerce.number().nonnegative().nullable().optional(),
    serviceCharge: z.coerce.number().nonnegative().optional(),
    rentIncludesServiceCharge: z.boolean().optional(),
    rentSharePercent: z.coerce.number().int().min(0).max(100).optional(),
    serviceChargeSharePercent: z.coerce.number().int().min(0).max(100).optional(),
    beds: z.coerce.number().int().nonnegative().optional(),
    baths: z.coerce.number().int().nonnegative().optional(),
    area: z.coerce.number().nonnegative().optional(),
    name: z.string().trim().min(1).max(24).optional(),
  })
  .strict();

export type UnitUpdateInput = z.infer<typeof unitUpdateInput>;
