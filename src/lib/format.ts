export const formatDate = (
  input?: string | number | Date | null,
  options?: Intl.DateTimeFormatOptions,
): string => {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleDateString(
    undefined,
    options ?? { year: "numeric", month: "short", day: "numeric" },
  );
};

export const formatDateTime = (input?: string | number | Date | null): string => {
  if (!input) return "—";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatKES = (value: number): string =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value);

export const relativeTime = (input?: string | number | Date | null): string => {
  if (!input) return "—";
  const timestamp = new Date(input).getTime();
  if (Number.isNaN(timestamp)) return String(input);
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(input);
};

export const toISODate = (date: Date): string => date.toISOString().slice(0, 10);
