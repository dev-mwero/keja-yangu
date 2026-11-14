/** @vitest-environment node */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND, BRAND_TITLE, BRAND_TITLE_TEMPLATE } from "@/lib/brand";

const SRC = join(process.cwd(), "src");

/**
 * Brand literals that must never reappear. `keja-` identifiers (session
 * cookie, storage keys, field-encryption salt) are deliberately not matched —
 * they are internal and renaming them would log users out or corrupt data.
 */
const LEGACY_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Keja Yangu", pattern: /\bKeja Yangu\b/ },
  { label: "Keja", pattern: /\bKeja\b/ },
  { label: "kejayangu", pattern: /kejayangu/i },
  { label: "keja-yangu.com", pattern: /keja-yangu\.com/i },
  { label: "@keja.co", pattern: /@keja\.co\b/ },
  { label: "d8tatechsolutions", pattern: /d8tatechsolutions/i },
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

const relativeToSrc = (file: string) => relative(SRC, file).split(sep).join("/");

describe("brand identity", () => {
  it("keeps the canonical identity in one place", () => {
    expect(BRAND.name).toBe("Custodian Homes");
    expect(BRAND.shortName).toBe("Custodian");
    expect(BRAND.url).toBe(`https://${BRAND.domain}`);
    expect(BRAND.emails).toEqual({
      info: "info@custodianhomes.co.ke",
      support: "support@custodianhomes.co.ke",
      noReply: "no-reply@custodianhomes.co.ke",
    });
    expect(BRAND_TITLE).toBe("Custodian Homes — Property Rentals & Tenant Management");
    expect(BRAND_TITLE_TEMPLATE).toBe("%s | Custodian Homes");
  });

  it("has no legacy brand strings outside the migration allowlist", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const rel = relativeToSrc(file);
      // Fixtures use placeholder addresses; they are not user-visible copy.
      if (rel.startsWith("test/")) continue;
      if (/\.test\.tsx?$/.test(rel)) continue;
      if (rel === "lib/brand.ts") continue;

      const source = readFileSync(file, "utf8");
      for (const { label, pattern } of LEGACY_PATTERNS) {
        if (pattern.test(source)) offenders.push(`${rel} → ${label}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the static manifest in sync with the brand module", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "public/manifest.json"), "utf8"),
    ) as { name?: string; short_name?: string };

    expect(manifest.name).toBe(BRAND.name);
    expect(manifest.short_name).toBe(BRAND.shortName);
  });
});
