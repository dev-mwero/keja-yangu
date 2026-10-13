export const parseImageUrls = (value: string): string[] =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const serializeImageUrls = (urls: string[]): string => urls.join("\n");

export const mergeImageUrls = (existing: string, urls: string[]): string => {
  const lines = parseImageUrls(existing);
  const known = new Set(lines);
  for (const url of urls) {
    const trimmed = url.trim();
    if (trimmed && !known.has(trimmed)) {
      known.add(trimmed);
      lines.push(trimmed);
    }
  }
  return serializeImageUrls(lines);
};

export const removeImageAt = (urls: string[], index: number): string[] =>
  urls.filter((_, i) => i !== index);

export const moveImage = (urls: string[], from: number, to: number): string[] => {
  if (from === to || from < 0 || to < 0 || from >= urls.length || to >= urls.length) {
    return urls;
  }
  const next = [...urls];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

export const setCoverImage = (urls: string[], index: number): string[] => {
  if (index <= 0 || index >= urls.length) return urls;
  return moveImage(urls, index, 0);
};
