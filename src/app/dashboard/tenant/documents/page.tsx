"use client";

import { Download, FileStack, FileText, Upload } from "lucide-react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { tenantNav } from "@/config/dashboardNav";
import { useDocuments } from "@/hooks/use-documents";
import type { DocumentCategory } from "@/lib/domain-enums";
import { formatDate } from "@/lib/format";
import type { DashboardDocument } from "@/types/communications";

const categoryClass: Record<DocumentCategory, string> = {
  lease: "bg-primary/15 text-primary",
  invoice: "bg-warning/15 text-warning",
  utility: "bg-muted text-muted-foreground",
  notice: "bg-destructive/15 text-destructive",
  inspection: "bg-success/15 text-success",
  policy: "bg-secondary/15 text-secondary",
};

const TenantDocumentsPage = () => {
  const { items } = useDocuments();
  const sorted = [...items].sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));

  const download = (doc: DashboardDocument) => {
    const blob = new Blob(
      [
        `${doc.name}\n\nCategory: ${doc.category}\nUploaded by: ${doc.uploadedBy}\nSize: ${doc.size}`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${doc.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Document downloaded");
  };

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Documents"
      subtitle="Your lease, receipts and property documents in one place."
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">My documents</h2>
          <p className="text-sm text-muted-foreground">{items.length} documents</p>
        </div>
        <Button variant="outline" className="rounded-full" onClick={() => toast.info("Uploads")}>
          <Upload className="h-4 w-4" />
          Request a document
        </Button>
      </div>

      <div className="mt-6">
        {sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <FileStack className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No documents yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Lease agreements and receipts will be added here by the landlord.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((doc) => (
                  <TableRow key={doc._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.property} · by {doc.uploadedBy}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`capitalize ${categoryClass[doc.category]} hover:opacity-100`}
                      >
                        {doc.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(doc.uploadedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.size}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => download(doc)}
                      >
                        <Download className="h-4 w-4" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
};

export default TenantDocumentsPage;
