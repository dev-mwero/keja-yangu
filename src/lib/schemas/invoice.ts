import { z } from "zod";
import { INVOICE_METHODS, PERIOD_REGEX } from "@/lib/invoicing";
import { hex24 } from "./lease";

export const dateString = z.string().regex(PERIOD_REGEX, "Period must match YYYY-MM");

// Manual create: with `leaseId` the server derives tenant/property/owner/amount
// from the lease; without it, `tenantId` + `propertyId` become required. A
// derived create must not carry any of the fields the server will override.
export const invoiceInput = z
  .object({
    leaseId: z.union([z.string().regex(hex24), z.literal("")]).optional(),
    tenantId: z.string().regex(hex24).optional(),
    propertyId: z.string().regex(hex24).optional(),
    amountDue: z.coerce.number().positive().optional(),
    status: z.enum(["draft", "pending"]).optional(),
    method: z.enum(INVOICE_METHODS).optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.leaseId) {
      if (data.tenantId) {
        ctx.addIssue({
          code: "custom",
          path: ["tenantId"],
          message: "tenantId is derived from the referenced lease",
        });
      }
      if (data.propertyId) {
        ctx.addIssue({
          code: "custom",
          path: ["propertyId"],
          message: "propertyId is derived from the referenced lease",
        });
      }
      if (data.amountDue != null) {
        ctx.addIssue({
          code: "custom",
          path: ["amountDue"],
          message: "amountDue is derived from the referenced lease",
        });
      }
    } else {
      if (!data.tenantId) {
        ctx.addIssue({
          code: "custom",
          path: ["tenantId"],
          message: "tenantId is required when leaseId is not provided",
        });
      }
      if (!data.propertyId) {
        ctx.addIssue({
          code: "custom",
          path: ["propertyId"],
          message: "propertyId is required when leaseId is not provided",
        });
      }
    }
  });

// PATCH: draft-only edits; identity fields (invoiceNumber/tenantId/propertyId/
// leaseId/ownerId/period) and audit stamps are immutable and stripped here.
export const invoiceUpdate = z.object({
  status: z.enum(["draft", "pending"]).optional(),
  amountDue: z.coerce.number().positive().optional(),
  method: z.enum(INVOICE_METHODS).optional(),
  notes: z.string().optional(),
});

// Future-period rejection is route-level (it needs `currentPeriod`).
export const invoiceGenerateInput = z.object({
  period: dateString.optional(),
});

// Deliberately no `amountPaid`: offline mark-paid always settles the full
// `amountDue` server-side. The field exists only for the future Paystack path.
export const invoiceMarkPaidInput = z.object({
  method: z.enum(INVOICE_METHODS).optional(),
  notes: z.string().optional(),
});

export type InvoiceInput = z.infer<typeof invoiceInput>;
export type InvoiceUpdate = z.infer<typeof invoiceUpdate>;
export type InvoiceGenerateInput = z.infer<typeof invoiceGenerateInput>;
export type InvoiceMarkPaidInput = z.infer<typeof invoiceMarkPaidInput>;
