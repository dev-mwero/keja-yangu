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
import { adminNav as nav } from "@/config/dashboardNav";
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

const AdminDocumentsPage = () => {
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
        description: err instanceof Error ? err.message : "Please try again.",
      });
    }
  };

  return (
    <DashboardShell
      roleName="Admin"
      nav={nav}
      title="Tenant Documents"
      subtitle="Vault for leases, inspection sheets, policy docs, and shared records."
    >
      <div className="mb-6 flex justify-end">
        <Button className="rounded-full" onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add document
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total documents" value={items.length} icon={FileText} />
        <StatCard
          label="Lease templates"
          value={items.filter((d) => d.category === "lease").length}
          icon={FileStack}
        />
        <StatCard
          label="Categories active"
          value={new Set(items.map((d) => d.category)).size}
          icon={FileText}
        />
      </div>

      <div className="mt-8">
        <div className="mb-4">
          <SearchInput
            placeholder="Search by name, category, uploader, property..."
            value={query}
            onChange={setQuery}
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded by</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Loading documents...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No documents found.
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((doc) => (
                  <TableRow key={doc._id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {doc.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={categoryClass[doc.category]}>
                        {doc.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{doc.property}</TableCell>
                    <TableCell className="text-muted-foreground">{doc.size}</TableCell>
                    <TableCell className="text-muted-foreground">{doc.uploadedBy}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(doc.uploadedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => download(doc)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Download
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px]">
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

export default AdminDocumentsPage;
