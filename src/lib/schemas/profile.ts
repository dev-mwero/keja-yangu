import { z } from "zod";

import { isValidE164, isValidNationalId, normalizeNationalId } from "@/lib/phone";

const optionalPhone = z
  .string()
  .trim()
  .refine((value) => value === "" || isValidE164(value), "Enter a valid number with country code")
  .optional();

export const profileUpdate = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120).optional(),
  phone: optionalPhone,
  whatsapp: optionalPhone,
  nationalId: z
    .string()
    .trim()
    .max(64)
    .refine(
      (value) => value === "" || isValidNationalId(normalizeNationalId(value)),
      "Enter a valid ID number",
    )
    .optional(),
});

export type ProfileUpdate = z.infer<typeof profileUpdate>;
