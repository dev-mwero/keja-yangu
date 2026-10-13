import { z } from "zod";
import { UNIT_STATUSES } from "@/lib/domain-enums";

export const unitUpdateInput = z.object({
  status: z.enum(UNIT_STATUSES).optional(),
  rent: z.coerce.number().nonnegative().nullable().optional(),
  beds: z.coerce.number().int().nonnegative().optional(),
  baths: z.coerce.number().int().nonnegative().optional(),
  area: z.coerce.number().nonnegative().optional(),
  name: z.string().trim().min(1).max(24).optional(),
  tenantId: z.string().trim().optional(),
});

export type UnitUpdateInput = z.infer<typeof unitUpdateInput>;
