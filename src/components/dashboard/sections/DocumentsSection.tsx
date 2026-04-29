import { useEffect, useRef, useState } from "react";
import { FileText, Download, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  addDocumentFromFile,
  deleteDocument,
  formatBytes,
  listOwnDocuments,
  listSharedDocuments,
  MAX_DOCUMENT_BYTES,
  type TenantDocument,
} from "@/lib/tenantDocuments";

export const DocumentsSection = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<TenantDocument[]>([]);
  const [shared, setShared] = useState<TenantDocument[]>([]);
  const [uploading, setUploading] = useState(false);

  const refresh = () => {
    if (user?.email) {
      setDocs(listOwnDocuments(user.email));
      setShared(listSharedDocuments(user.email));
    }
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("keja-documents-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("keja-documents-changed", handler);
      window.removeEventListener("storage", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.email) return;
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast({
        title: "File too large",
        description: `Please pick a file under ${formatBytes(MAX_DOCUMENT_BYTES)}.`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      await addDocumentFromFile(user.email, file);
      toast({ title: "Uploaded", description: `${file.name} added to your documents.` });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Could not save file.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const onDelete = (doc: TenantDocument) => {
    deleteDocument(doc.id);
    toast({ title: "Removed", description: `${doc.name} deleted.` });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium">Upload a document</p>
          <p className="text-xs text-muted-foreground">
            PDFs, images or office files up to {formatBytes(MAX_DOCUMENT_BYTES)}.
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
            onChange={onUpload}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={uploading || !user}>
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        </div>
      </div>

      {docs.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Your uploads
          </p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(d.size)} · {new Date(d.uploadedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button asChild size="sm" variant="outline">
                    <a href={d.dataUrl} download={d.name}>
                      <Download className="mr-1.5 h-4 w-4" />Download
                    </a>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(d)}
                    aria-label={`Delete ${d.name}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Shared with you
        </p>
        {shared.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            Nothing shared with you yet. Documents from your caretaker or owner will appear here.
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {shared.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      From {d.sharedByName || d.sharedByEmail || (d.source === "owner" ? "Owner" : "Caretaker")}
                      {" · "}
                      {new Date(d.uploadedAt).toLocaleDateString()}
                    </p>
                    {d.note && (
                      <p className="mt-1 text-xs italic text-muted-foreground">"{d.note}"</p>
                    )}
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={d.dataUrl} download={d.name}>
                    <Download className="mr-1.5 h-4 w-4" />Download
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};