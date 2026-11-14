import { Mail } from "lucide-react";
import { BRAND } from "@/lib/brand";

/**
 * Settings footnote: which address transactional mail comes from, and where to
 * ask for help. Shared by every role's settings page so the addresses live in
 * exactly one place (`src/lib/brand.ts`).
 */
export const SupportEmailNote = () => (
  <div className="mt-6 flex items-start gap-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
    <Mail className="mt-0.5 h-4 w-4 shrink-0" />
    <span>
      Verification and password emails come from{" "}
      <a
        href={`mailto:${BRAND.emails.noReply}`}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {BRAND.emails.noReply}
      </a>
      . Check spam if you don&apos;t see them. Need a hand? Email{" "}
      <a
        href={`mailto:${BRAND.emails.support}`}
        className="font-medium text-foreground underline-offset-4 hover:underline"
      >
        {BRAND.emails.support}
      </a>
      .
    </span>
  </div>
);
