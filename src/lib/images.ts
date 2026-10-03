export const mergeImageUrls = (existing: string, urls: string[]): string => {
  const lines = existing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const known = new Set(lines);
  for (const url of urls) {
    const trimmed = url.trim();
    if (trimmed && !known.has(trimmed)) {
      known.add(trimmed);
      lines.push(trimmed);
    }
  }
  return lines.join("\n");
};
