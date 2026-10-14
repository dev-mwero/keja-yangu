/**
 * Case-insensitive free-text matching shared by the dashboard list filters.
 *
 * A blank/whitespace-only query matches everything, so a list reads as
 * unfiltered until the user actually types. Pass every field worth matching on
 * and the record matches if any of them contains the query substring.
 */
export function matchesQuery(
  query: string,
  ...values: Array<string | number | null | undefined>
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value != null && String(value).toLowerCase().includes(needle));
}
