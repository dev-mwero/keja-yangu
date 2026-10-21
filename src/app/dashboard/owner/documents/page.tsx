"use client";

import { Download, FileStack, FileText, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { SearchInput } from "@/components/SearchInput";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ownerNav as nav } from "@/config/dashboardNav";
import { useDocumentMutations, useDocuments } from "@/hooks/use-documents";
import { useProperties } from "@/hooks/use-properties";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/lib/domain-enums";
import { formatDate } from "@/lib/format";
import { matchesQuery } from "@/lib/search";
import type { DashboardDocument } from "@/types/communications";

const categoryClass: Record<DocumentCategory, string> = {
  lease: "bg-primary/15 text-primary",
  invoice: "bg-warning/15 text-warning",
  utility: "bg-muted text-muted-foreground",
  notice: "bg-destructive/15 text-destructive",
  inspection: "bg-success/15 text-success",
  policy: "bg-secondary/15 text-secondary",
};

const OwnerDocumentsPage = () => {
  const { items, loading, error, refetch } = useDocuments();
  const { createDocument, pending } = useDocumentMutations();
  const { properties } = useProperties();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("lease");
  const [propertyId, setPropertyId] = useState("");
  const [query, setQuery] = useState("");

  const sorted = [...items]
    .filter((doc) => matchesQuery(query, doc.name, doc.category, doc.uploadedBy, doc.property))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

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

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Document name is required");
      return;
    }
    try {
      await createDocument({
        name: name.trim(),
        category,
        scope: propertyId ? "property" : "landlord",
        propertyId,
      });
      toast.success("Document added", { description: `${name.trim()} saved to the vault.` });
      setName("");
      setPropertyId("");
      setOpen(false);
      refetch();
    } catch (err) {
      toast.error("Could not add document", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const thisMonth = items.filter((doc) => {
    const date = new Date(doc.uploadedAt);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  return (
    <DashboardShell
      roleName="Owner"
      nav={nav}
      title="Documents"
      subtitle="Lease templates, policies and shared records for the portfolio."
    >
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Total documents" value={loading ? "…" : items.length} icon={FileStack} />
        <StatCard
          label="Categories in use"
          value={loading ? "…" : new Set(items.map((d) => d.category)).size}
          icon={FileText}
          hint={`${DOCUMENT_CATEGORIES.length} available`}
        />
        <StatCard label="Added this month" value={loading ? "…" : thisMonth} icon={Plus} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Document vault</h2>
          <p className="text-sm text-muted-foreground">{items.length} documents</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search documents…"
            className="w-full sm:w-56"
          />
          <Button className="rounded-full" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add document
          </Button>
        </div>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-muted-foreground">
            Loading documents…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-dashed border-destructive/40 bg-card/50 p-10 text-center text-destructive">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center">
            <FileStack className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-display text-xl">No documents yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {items.length > 0
                ? "No documents match your search."
                : "Upload lease templates and policies for the whole portfolio."}
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
                            {doc.uploadedBy}
                            {doc.property ? ` · ${doc.property}` : ""}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a document</DialogTitle>
            <DialogDescription>
              Store a lease template, policy or notice in the vault.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Document name</div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 2026 lease template"
              />
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Category</div>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c.slice(0, 1).toUpperCase() + c.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="text-sm font-medium text-muted-foreground">Property</div>
              <Select
                value={propertyId || "portfolio"}
                onValueChange={(v) => setPropertyId(v === "portfolio" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portfolio">Portfolio-wide</SelectItem>
                  {properties.map((property) => (
                    <SelectItem key={property._id} value={property._id}>
                      {property.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={() => void submit()}>
              {pending ? "Adding…" : "Add document"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default OwnerDocumentsPage;
