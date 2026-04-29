import { z } from "zod";

export interface TenantDocument {
  id: string;
  tenantEmail: string;
  name: string;
  size: number;
  mimeType: string;
  /** Data URL — fine for the local-only demo; do NOT use this approach for real backends. */
  dataUrl: string;
  uploadedAt: string;
  /** Who uploaded the document. Defaults to the tenant for self-uploads. */
  source?: "tenant" | "caretaker" | "owner";
  /** Display name / email of the person who shared it (for shared docs). */
  sharedByName?: string;
  sharedByEmail?: string;
  /** Optional note from the sharer. */
  note?: string;
}

const STORAGE_KEY = "keja-tenant-documents";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB cap for localStorage safety

export const documentMetaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(MAX_FILE_BYTES),
  mimeType: z.string().min(1).max(120),
});

const readAll = (): TenantDocument[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TenantDocument[]) : [];
  } catch {
    return [];
  }
};

const writeAll = (docs: TenantDocument[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
  window.dispatchEvent(new Event("keja-documents-changed"));
};

export const listDocumentsForTenant = (tenantEmail: string): TenantDocument[] =>
  readAll()
    .filter((d) => d.tenantEmail.toLowerCase() === tenantEmail.toLowerCase())
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

/** Documents the tenant uploaded themselves. */
export const listOwnDocuments = (tenantEmail: string): TenantDocument[] =>
  listDocumentsForTenant(tenantEmail).filter((d) => !d.source || d.source === "tenant");

/** Documents shared *to* the tenant by a caretaker/owner. */
export const listSharedDocuments = (tenantEmail: string): TenantDocument[] =>
  listDocumentsForTenant(tenantEmail).filter((d) => d.source === "caretaker" || d.source === "owner");

/** Documents shared *by* a given user (caretaker/owner) across tenants. */
export const listDocumentsSharedBy = (sharerEmail: string): TenantDocument[] =>
  readAll()
    .filter((d) => d.sharedByEmail?.toLowerCase() === sharerEmail.toLowerCase())
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

export const deleteDocument = (id: string) => {
  writeAll(readAll().filter((d) => d.id !== id));
};

export const MAX_DOCUMENT_BYTES = MAX_FILE_BYTES;

export const addDocumentFromFile = async (
  tenantEmail: string,
  file: File,
  options?: {
    source?: "tenant" | "caretaker" | "owner";
    sharedByName?: string;
    sharedByEmail?: string;
    note?: string;
  },
): Promise<TenantDocument> => {
  const meta = documentMetaSchema.parse({
    name: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  });

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  const doc: TenantDocument = {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tenantEmail,
    name: meta.name,
    size: meta.size,
    mimeType: meta.mimeType,
    dataUrl,
    uploadedAt: new Date().toISOString(),
    source: options?.source ?? "tenant",
    sharedByName: options?.sharedByName,
    sharedByEmail: options?.sharedByEmail,
    note: options?.note?.trim() || undefined,
  };

  writeAll([doc, ...readAll()]);
  return doc;
};

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};