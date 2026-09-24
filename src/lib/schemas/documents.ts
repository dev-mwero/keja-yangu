import { z } from "zod";
import { DOCUMENT_CATEGORIES, DOCUMENT_SCOPES } from "@/lib/domain-enums";
import { hex24 } from "./lease";

// POST /api/v1/documents is deferred to the owner-documents conversion (plan
// §5); the input schema ships now so that route becomes a thin wire-up later.
// Documents are metadata rows only — no contentUrl or file payload.
export const documentInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.enum(DOCUMENT_CATEGORIES),
  scope: z.enum(DOCUMENT_SCOPES),
  propertyId: z.string().regex(hex24),
  tenantId: z.string().regex(hex24).optional(),
  uploadedByName: z.string().trim().min(1, "Uploader name is required").max(200),
  sizeLabel: z.string().max(50).default("—"),
});

export type DocumentInput = z.infer<typeof documentInput>;
