import { z } from "zod";
import { hex24 } from "./lease";

const appliesTo = z.enum(["all", "selected"]);

const serviceFeeItemFields = {
  label: z.string().trim().min(1).max(60),
  amount: z.coerce.number().nonnegative(),
  active: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
  appliesTo: appliesTo.optional(),
  unitIds: z.array(z.string().regex(hex24)).max(2000).optional(),
};

export const serviceFeeItemCreateInput = z
  .object(serviceFeeItemFields)
  .strict()
  .superRefine((data, ctx) => {
    if ((data.appliesTo ?? "all") === "selected" && (data.unitIds?.length ?? 0) === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["unitIds"],
        message: "Select at least one unit when the fee applies to selected units",
      });
    }
  });

export const serviceFeeItemUpdateInput = z
  .object({
    label: serviceFeeItemFields.label.optional(),
    amount: serviceFeeItemFields.amount.optional(),
    active: serviceFeeItemFields.active,
    sortOrder: serviceFeeItemFields.sortOrder,
    appliesTo: serviceFeeItemFields.appliesTo,
    unitIds: serviceFeeItemFields.unitIds,
  })
  .strict();

const overrideInput = z
  .object({
    itemId: z.string().regex(hex24),
    amount: z.coerce.number().nonnegative().nullable().optional(),
    active: z.boolean().nullable().optional(),
  })
  .strict();

export const unitServiceFeeOverrideInput = z
  .object({
    unitId: z.string().regex(hex24),
    overrides: z.array(overrideInput).min(1).max(200),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const [index, override] of data.overrides.entries()) {
      if (seen.has(override.itemId)) {
        ctx.addIssue({
          code: "custom",
          path: ["overrides", index, "itemId"],
          message: "Duplicate item override",
        });
      }
      seen.add(override.itemId);
    }
  });

export type ServiceFeeItemCreateInput = z.infer<typeof serviceFeeItemCreateInput>;
export type ServiceFeeItemUpdateInput = z.infer<typeof serviceFeeItemUpdateInput>;
export type UnitServiceFeeOverrideInput = z.infer<typeof unitServiceFeeOverrideInput>;
