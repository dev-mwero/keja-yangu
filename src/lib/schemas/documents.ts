import { z } from "zod";
import { DOCUMENT_CATEGORIES, DOCUMENT_SCOPES } from "@/lib/domain-enums";
import { hex24 } from "./lease";

// Metadata-only document rows — no contentUrl or file payload.
export const documentInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.enum(DOCUMENT_CATEGORIES),
  scope: z.enum(DOCUMENT_SCOPES).default("landlord"),
  // Empty string = portfolio-wide (landlord scope).
  propertyId: z
    .union([z.string().regex(hex24), z.literal("")])
    .optional()
    .default(""),
  tenantId: z
    .union([z.string().regex(hex24), z.literal("")])
    .optional()
    .default(""),
  sizeLabel: z.string().max(50).default("—"),
});

export type DocumentInput = z.infer<typeof documentInput>;
