import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Upload, Trash2, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  addDocumentFromFile,
  deleteDocument,
  formatBytes,
  listDocumentsSharedBy,
  MAX_DOCUMENT_BYTES,
  type TenantDocument,
  type DocumentCategory,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
} from "@/lib/tenantDocuments";
import { Badge } from "@/components/ui/badge";

interface KnownTenant {
  email: string;
  name?: string;
}

const APPLICATIONS_KEY = "keja-applications";

/** Pull a unique list of tenants we've ever seen (from saved applications). */
const readKnownTenants = (): KnownTenant[] => {
  try {
    const raw = localStorage.getItem(APPLICATIONS_KEY);
    if (!raw) return [];
    const apps = JSON.parse(raw) as Array<{ tenantEmail?: string; applicantName?: string }>;
    const map = new Map<string, KnownTenant>();
    for (const a of apps) {
      if (!a?.tenantEmail) continue;
      const key = a.tenantEmail.toLowerCase();
      if (!map.has(key)) map.set(key, { email: a.tenantEmail, name: a.applicantName });
    }
    return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
  } catch {
    return [];
  }
};

interface Props {
  source: "caretaker" | "owner";
}

export const ShareDocumentsSection = ({ source }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [tenants, setTenants] = useState<KnownTenant[]>([]);
  const [selected, setSelected] = useState<string>("__manual__");
  const [manualEmail, setManualEmail] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState<TenantDocument[]>([]);
  const [category, setCategory] = useState<DocumentCategory>("lease");

  const refresh = () => {
    setTenants(readKnownTenants());
    if (user?.email) setShared(listDocumentsSharedBy(user.email));
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("keja-documents-changed", handler);
    window.addEventListener("keja-applications:changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("keja-documents-changed", handler);
      window.removeEventListener("keja-applications:changed", handler);
      window.removeEventListener("storage", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const targetEmail = useMemo(() => {
    if (selected !== "__manual__") return selected;
    return manualEmail.trim();
  }, [selected, manualEmail]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (f && f.size > MAX_DOCUMENT_BYTES) {
      toast({
        title: "File too large",
        description: `Please pick a file under ${formatBytes(MAX_DOCUMENT_BYTES)}.`,
        variant: "destructive",
      });
      return;
    }
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail);
    if (!emailOk) {
      toast({ title: "Tenant email required", description: "Pick a tenant or enter a valid email.", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Pick a file", description: "Choose a document to share.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await addDocumentFromFile(targetEmail, file, {
        source,
        sharedByName: user.name,
        sharedByEmail: user.email,
        note,
        category,
      });
      toast({ title: "Shared", description: `${file.name} sent to ${targetEmail}.` });
      setFile(null);
      setNote("");
      setCategory("lease");
      if (selected === "__manual__") setManualEmail("");
    } catch (err) {
      toast({
        title: "Could not share",
        description: err instanceof Error ? err.message : "Failed to upload file.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = (doc: TenantDocument) => {
    deleteDocument(doc.id);
    toast({ title: "Removed", description: `${doc.name} no longer shared with ${doc.tenantEmail}.` });
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft"
      >
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Share a document with a tenant</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tenant</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a tenant" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__manual__">Enter email manually…</SelectItem>
                {tenants.map((t) => (
                  <SelectItem key={t.email} value={t.email}>
                    {t.name ? `${t.name} — ${t.email}` : t.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected === "__manual__" && (
              <Input
                type="email"
                placeholder="tenant@example.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>File</Label>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
              onChange={onPickFile}
            />
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {file ? "Change file" : "Choose file"}
              </Button>
              {file && (
                <span className="truncate text-sm text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Max {formatBytes(MAX_DOCUMENT_BYTES)} per file.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
            <SelectTrigger className="sm:w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Note (optional)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Signed lease — please keep for your records."
            rows={3}
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy}>
            <Send className="mr-2 h-4 w-4" />
            {busy ? "Sharing…" : "Share document"}
          </Button>
        </div>
      </form>

      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Documents you've shared
        </p>
        {shared.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            Nothing shared yet. Documents you send will appear here and on the tenant's dashboard.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shared.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{d.name}</p>
                      <Badge variant="secondary" className="shrink-0">
                        {DOCUMENT_CATEGORY_LABELS[(d.category ?? "other") as DocumentCategory]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      To {d.tenantEmail} · {formatBytes(d.size)} ·{" "}
                      {new Date(d.uploadedAt).toLocaleDateString()}
                    </p>
                    {d.note && (
                      <p className="mt-1 text-xs italic text-muted-foreground">"{d.note}"</p>
                    )}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onRevoke(d)}
                  aria-label={`Revoke ${d.name}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};