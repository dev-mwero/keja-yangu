import { z } from "zod";

export const contactInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  email: z.string().trim().email("Enter a valid email"),
  subject: z.string().trim().min(1, "Subject is required").max(120, "Subject is too long"),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message is too long"),
});

export type ContactInput = z.infer<typeof contactInput>;
