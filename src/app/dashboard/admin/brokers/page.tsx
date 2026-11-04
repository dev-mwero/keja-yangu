"use client";

import { Check, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminNav as nav } from "@/config/dashboardNav";
import { useAuth } from "@/hooks/use-auth";
import { useProperties } from "@/hooks/use-properties";

export default function AdminBrokersPage() {
  const { user } = useAuth();
  const { properties } = useProperties();
  const [brokers, setBrokers] = useState<any[]>([]);
  const [authorizations, setAuthorizations] = useState<any[]>([]);

  // New Authorization dialog state
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [scopeType, setScopeType] = useState<"property" | "unit">("property");
  const [scopeId, setScopeId] = useState("");
  const [commissionBasis, setCommissionBasis] = useState<
    "first_month_rent" | "percentage_of_rent" | "fixed"
  >("first_month_rent");
  const [rateBps, setRateBps] = useState(1000); // 10%
  const [fixedAmount, setFixedAmount] = useState(10000);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  const fetchBrokersAndAuths = useCallback(async () => {
    try {
      const [brokersRes, authsRes] = await Promise.all([
        fetch("/api/v1/brokers"),
        fetch("/api/v1/brokers/authorizations"),
      ]);

      if (brokersRes.ok) {
        const data = await brokersRes.json();
        setBrokers(data.brokers || []);
      }
      if (authsRes.ok) {
        const data = await authsRes.json();
        setAuthorizations(data.authorizations || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load broker data");
    }
  }, []);

  useEffect(() => {
    fetchBrokersAndAuths();
  }, [fetchBrokersAndAuths]);

  const handleVerifyDecision = async (
    brokerProfileId: string,
    decision: "verified" | "rejected" | "suspended",
  ) => {
    try {
      const res = await fetch(`/api/v1/brokers/${brokerProfileId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, notes: `Admin decision: ${decision}` }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update verification");
      }

      toast.success(`Broker marked as ${decision}`);
      fetchBrokersAndAuths();
    } catch (err: any) {
      toast.error(err.message || "Action failed");
    }
  };

  const handleGrantAuthorization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrokerId || !selectedPropertyId) {
      toast.error("Please select a broker and property");
      return;
    }

    const effectiveScopeId = scopeType === "property" ? selectedPropertyId : scopeId;
    if (!effectiveScopeId) {
      toast.error("Scope ID is required");
      return;
    }

    try {
      setSubmittingAuth(true);

      // 1. Create authorization
      const authRes = await fetch("/api/v1/brokers/authorizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerId: selectedBrokerId,
          scopeType,
          scopeId: effectiveScopeId,
          propertyId: selectedPropertyId,
        }),
      });

      if (!authRes.ok) {
        const data = await authRes.json();
        throw new Error(data.error || "Failed to grant authorization");
      }

      // 2. Create commission agreement
      const agrRes = await fetch("/api/v1/brokers/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerId: selectedBrokerId,
          scopeType,
          scopeId: effectiveScopeId,
          propertyId: selectedPropertyId,
          basis: commissionBasis,
          rateBps: commissionBasis === "percentage_of_rent" ? rateBps : 0,
          fixedAmountMinor: commissionBasis === "fixed" ? fixedAmount * 100 : 0,
          autoActivate: true,
        }),
      });

      if (!agrRes.ok) {
        const data = await agrRes.json();
        throw new Error(data.error || "Failed to create commission agreement");
      }

      toast.success("Broker authorized and commission terms assigned");
      setAuthDialogOpen(false);
      fetchBrokersAndAuths();
    } catch (err: any) {
      toast.error(err.message || "Failed to complete authorization");
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleRevokeAuth = async (authId: string) => {
    if (!confirm("Are you sure you want to revoke this broker authorization?")) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/brokers/authorizations/${authId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "revoked", reason: "Revoked by admin" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke authorization");
      }

      toast.success("Authorization revoked");
      fetchBrokersAndAuths();
    } catch (err: any) {
      toast.error(err.message || "Failed to revoke");
    }
  };

  const verifiedBrokers = brokers.filter((b) => b.status === "verified");

  return (
    <DashboardShell
      roleName="Admin"
      nav={nav}
      title="Broker Management"
      subtitle="Verify broker profiles, grant property/unit distribution authorizations, and establish commission agreements."
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Broker Network & Authorizations</h2>
            <p className="text-sm text-muted-foreground">
              Authorize external verified brokers to source tenants without granting internal tenant
              or accounting access.
            </p>
          </div>

          <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Authorize Broker
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Authorize Broker for Property or Unit</DialogTitle>
                <DialogDescription>
                  Grant a verified broker rights to distribute your listing and set commission
                  terms.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleGrantAuthorization} className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="brokerSelect">Select Verified Broker</Label>
                  <select
                    id="brokerSelect"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedBrokerId}
                    onChange={(e) => setSelectedBrokerId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose Broker --</option>
                    {verifiedBrokers.map((b) => (
                      <option key={b.userId} value={b.userId}>
                        {b.agencyName ? `${b.agencyName} (${b.phone})` : b.phone}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="propertySelect">Property</Label>
                  <select
                    id="propertySelect"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={selectedPropertyId}
                    onChange={(e) => {
                      setSelectedPropertyId(e.target.value);
                      if (scopeType === "property") {
                        setScopeId(e.target.value);
                      }
                    }}
                    required
                  >
                    <option value="">-- Choose Property --</option>
                    {properties.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="scopeTypeSelect">Scope Type</Label>
                    <select
                      id="scopeTypeSelect"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={scopeType}
                      onChange={(e) => setScopeType(e.target.value as "property" | "unit")}
                    >
                      <option value="property">Entire Property</option>
                      <option value="unit">Specific Unit ID</option>
                    </select>
                  </div>

                  {scopeType === "unit" && (
                    <div className="space-y-2">
                      <Label htmlFor="unitIdInput">Unit ID</Label>
                      <Input
                        id="unitIdInput"
                        placeholder="e.g. unit-123"
                        value={scopeId}
                        onChange={(e) => setScopeId(e.target.value)}
                        required
                      />
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3">
                  <h4 className="text-sm font-semibold mb-2">Commission Terms</h4>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="basisSelect">Commission Basis</Label>
                      <select
                        id="basisSelect"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={commissionBasis}
                        onChange={(e) =>
                          setCommissionBasis(
                            e.target.value as "first_month_rent" | "percentage_of_rent" | "fixed",
                          )
                        }
                      >
                        <option value="first_month_rent">First Month Rent (100%)</option>
                        <option value="percentage_of_rent">Percentage of Collected Rent</option>
                        <option value="fixed">Fixed One-off Amount</option>
                      </select>
                    </div>

                    {commissionBasis === "percentage_of_rent" && (
                      <div className="space-y-2">
                        <Label htmlFor="rateInput">Rate (%)</Label>
                        <Input
                          id="rateInput"
                          type="number"
                          min="1"
                          max="100"
                          value={rateBps / 100}
                          onChange={(e) => setRateBps(Number(e.target.value) * 100)}
                        />
                      </div>
                    )}

                    {commissionBasis === "fixed" && (
                      <div className="space-y-2">
                        <Label htmlFor="fixedAmountInput">Amount (KES)</Label>
                        <Input
                          id="fixedAmountInput"
                          type="number"
                          min="0"
                          value={fixedAmount}
                          onChange={(e) => setFixedAmount(Number(e.target.value))}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter className="mt-4">
                  <Button type="button" variant="outline" onClick={() => setAuthDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submittingAuth}>
                    {submittingAuth ? "Authorizing..." : "Confirm Authorization"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="authorizations" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
            <TabsTrigger value="authorizations">Active Authorizations</TabsTrigger>
            <TabsTrigger value="brokers">Registered Brokers</TabsTrigger>
          </TabsList>

          <TabsContent value="authorizations" className="mt-6">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Granted Distribution Authorizations</h3>
                <p className="text-xs text-muted-foreground">
                  Active broker access to distribute listings on your properties.
                </p>
              </div>

              {authorizations.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No authorizations granted yet. Use the "Authorize Broker" button above.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Broker ID</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Property ID</TableHead>
                      <TableHead>Granted Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authorizations.map((a) => (
                      <TableRow key={a._id}>
                        <TableCell className="font-mono text-xs">{a.brokerId}</TableCell>
                        <TableCell className="capitalize">
                          {a.scopeType} ({a.scopeId})
                        </TableCell>
                        <TableCell className="font-mono text-xs">{a.propertyId}</TableCell>
                        <TableCell>{new Date(a.grantedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "active" ? "default" : "destructive"}>
                            {a.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {a.status === "active" && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRevokeAuth(a._id)}
                            >
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="brokers" className="mt-6">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Broker Network Directory</h3>
                <p className="text-xs text-muted-foreground">
                  Registered broker profiles across the platform.
                </p>
              </div>

              {brokers.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No brokers registered yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agency / Name</TableHead>
                      <TableHead>License #</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Status</TableHead>
                      {user?.role === "system-admin" && (
                        <TableHead className="text-right">Admin Action</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {brokers.map((b) => (
                      <TableRow key={b._id}>
                        <TableCell className="font-medium">
                          {b.agencyName || "Independent Broker"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {b.licenseNumber || "N/A"}
                        </TableCell>
                        <TableCell>
                          <span className="block text-sm">{b.phone}</span>
                          <span className="text-xs text-muted-foreground">{b.email}</span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              b.status === "verified"
                                ? "default"
                                : b.status === "pending"
                                  ? "outline"
                                  : "destructive"
                            }
                          >
                            {b.status}
                          </Badge>
                        </TableCell>
                        {user?.role === "system-admin" && (
                          <TableCell className="text-right">
                            {b.status === "pending" && (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-emerald-600 border-emerald-600"
                                  onClick={() => handleVerifyDecision(b._id, "verified")}
                                >
                                  <Check className="h-3.5 w-3.5 mr-1" /> Verify
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-8"
                                  onClick={() => handleVerifyDecision(b._id, "rejected")}
                                >
                                  <X className="h-3.5 w-3.5 mr-1" /> Reject
                                </Button>
                              </div>
                            )}
                            {b.status === "verified" && (
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8"
                                onClick={() => handleVerifyDecision(b._id, "suspended")}
                              >
                                Suspend
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
