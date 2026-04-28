import { z } from "zod";

export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface Application {
  id: string;
  tenantEmail: string;
  propertyId: string;
  propertyTitle: string;
  applicantName: string;
  applicantEmail: string;
  message?: string;
  status: ApplicationStatus;
  submittedAt: string; // ISO
}

const STORAGE_KEY = "keja-applications";

export const applicationInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be under 100 characters"),
  email: z.string().trim().email("Invalid email").max(255, "Email must be under 255 characters"),
  message: z.string().trim().max(500, "Message must be under 500 characters").optional(),
});

export type ApplicationInput = z.infer<typeof applicationInputSchema>;

const readAll = (): Application[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Application[];
  } catch {
    return [];
  }
};

const writeAll = (apps: Application[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  // Notify listeners in the same tab
  window.dispatchEvent(new CustomEvent("keja-applications:changed"));
};

export const listApplicationsForTenant = (tenantEmail: string): Application[] =>
  readAll()
    .filter((a) => a.tenantEmail.toLowerCase() === tenantEmail.toLowerCase())
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

export const hasPendingApplication = (tenantEmail: string, propertyId: string): boolean =>
  readAll().some(
    (a) =>
      a.tenantEmail.toLowerCase() === tenantEmail.toLowerCase() &&
      a.propertyId === propertyId &&
      a.status === "pending",
  );

export const createApplication = (params: {
  tenantEmail: string;
  propertyId: string;
  propertyTitle: string;
  input: ApplicationInput;
}): Application => {
  const app: Application = {
    id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantEmail: params.tenantEmail,
    propertyId: params.propertyId,
    propertyTitle: params.propertyTitle,
    applicantName: params.input.name,
    applicantEmail: params.input.email,
    message: params.input.message || undefined,
    status: "pending",
    submittedAt: new Date().toISOString(),
  };
  const all = readAll();
  all.push(app);
  writeAll(all);
  return app;
};

export const cancelApplication = (id: string, tenantEmail: string): boolean => {
  const all = readAll();
  const next = all.filter(
    (a) => !(a.id === id && a.tenantEmail.toLowerCase() === tenantEmail.toLowerCase()),
  );
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
};

export const subscribeApplications = (cb: () => void): (() => void) => {
  const onChange = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("keja-applications:changed", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("keja-applications:changed", onChange);
    window.removeEventListener("storage", onStorage);
  };
};