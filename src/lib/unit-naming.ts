/**
 * Unit naming helpers.
 *
 * Units are named by floor digit followed by a letter, e.g. `3A`, `3B`. The
 * ground floor (level <= 0) uses the `G` prefix instead of a digit, e.g. `GA`,
 * `GB`. Callers may override the generated names with custom ones (the
 * in-charge can rename a unit).
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Zero-based letter label: 0 -> "A", 25 -> "Z", 26 -> "AA", 27 -> "AB", ...
 */
export function letterLabel(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    throw new Error("letterLabel expects a non-negative integer");
  }
  let n = Math.floor(index);
  let out = "";
  do {
    out = LETTERS[n % 26] + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Ground floor (level <= 0) is prefixed with "G"; other floors use the number. */
export function floorPrefix(level: number): string {
  return level <= 0 ? "G" : String(Math.floor(level));
}

/** Default unit name for a floor level and zero-based index: `3A`, `GA`, ... */
export function defaultUnitName(level: number, index: number): string {
  return `${floorPrefix(level)}${letterLabel(index)}`;
}

/**
 * Build `count` unit names for a floor. `customNames` (if provided) override the
 * generated name at the matching index; blank custom entries fall back to the
 * default.
 */
export function buildUnitNames(level: number, count: number, customNames?: string[]): string[] {
  const total = Math.max(0, Math.floor(count));
  return Array.from({ length: total }, (_, i) => {
    const custom = customNames?.[i]?.trim();
    return custom && custom.length > 0 ? custom : defaultUnitName(level, i);
  });
}

/**
 * Ensure unit names within a single block are unique. Throws on the first
 * duplicate so callers can surface a validation error.
 */
export function assertUniqueUnitNames(names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Duplicate unit name in block: ${name}`);
    }
    seen.add(key);
  }
}
