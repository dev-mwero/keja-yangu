"use client";

import { Check, Copy, ExternalLink, Shield } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { brokerNav as nav } from "@/config/dashboardNav";
import { useAuth } from "@/hooks/use-auth";
import { formatKES } from "@/lib/format";

export default function BrokerDashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [authorizations, setAuthorizations] = useState<any[]>([]);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Profile form state
  const [agencyName, setAgencyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [payoutType, setPayoutType] = useState<"mpesa" | "bank" | "none">("none");
  const [accountNumber, setAccountNumber] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const fetchBrokerData = useCallback(async () => {
    try {
      // Fetch profile
      const profRes = await fetch("/api/v1/brokers/profile");
      if (profRes.ok) {
        const profData = await profRes.json();
        setProfile(profData.profile);
        setAgencyName(profData.profile.agencyName || "");
        setLicenseNumber(profData.profile.licenseNumber || "");
        setPhone(profData.profile.phone || "");
        setEmail(profData.profile.email || "");
        setPayoutType(profData.profile.payoutMethod?.payoutType || "none");
        setAccountNumber(profData.profile.payoutMethod?.accountNumber || "");
      } else if (profRes.status === 404) {
        // Pre-fill user contact info if profile doesn't exist yet
        if (user) {
          setPhone(user.phone || "");
          setEmail(user.email || "");
        }
      }

      // Fetch authorizations
      const authRes = await fetch("/api/v1/brokers/authorizations");
      if (authRes.ok) {
        const authData = await authRes.json();
        setAuthorizations(authData.authorizations || []);
      }

      // Fetch agreements
      const agrRes = await fetch("/api/v1/brokers/agreements");
      if (agrRes.ok) {
        const agrData = await agrRes.json();
        setAgreements(agrData.agreements || []);
      }

      // Fetch listings
      const listRes = await fetch("/api/v1/brokers/listings");
      if (listRes.ok) {
        const listData = await listRes.json();
        setListings(listData.listings || []);
      }

      // Fetch redacted attributed prospects
      const prospectRes = await fetch("/api/v1/brokers/prospects");
      if (prospectRes.ok) {
        const prospectData = await prospectRes.json();
        setProspects(prospectData.prospects || []);
      }

      // Fetch commission accruals
      const commissionRes = await fetch("/api/v1/brokers/commissions");
      if (commissionRes.ok) {
        const commissionData = await commissionRes.json();
        setCommissions(commissionData.data || []);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load broker information");
    }
  }, [user]);

  useEffect(() => {
    fetchBrokerData();
  }, [fetchBrokerData]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      const res = await fetch("/api/v1/brokers/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyName,
          licenseNumber,
          phone,
          email,
          payoutMethod: {
            payoutType,
            accountNumber,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }

      const data = await res.json();
      setProfile(data.profile);
      toast.success("Profile saved successfully");
      fetchBrokerData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePublish = async (listingId: string) => {
    try {
      const res = await fetch(`/api/v1/brokers/listings/${listingId}/publish`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate share link");
      }

      toast.success("Share link generated!");
      fetchBrokerData();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate link");
    }
  };

  const handleAcceptAgreement = async (agreementId: string) => {
    try {
      const res = await fetch(`/api/v1/brokers/agreements/${agreementId}/accept`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to accept agreement");
      }

      toast.success("Commission agreement accepted");
      fetchBrokerData();
    } catch (err: any) {
      toast.error(err.message || "Failed to accept agreement");
    }
  };

  const copyToClipboard = (text: string, code: string) => {
    const fullUrl = `${window.location.origin}${text}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedCode(code);
    toast.success("Share link copied to clipboard");
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const statusBadge = () => {
    if (!profile) {
      return (
        <Badge variant="outline" className="border-amber-500 text-amber-500">
          Unregistered
        </Badge>
      );
    }
    switch (profile.status) {
      case "verified":
        return (
          <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
            <Shield className="mr-1 h-3 w-3" /> Verified Broker
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" className="border-amber-500 text-amber-500">
            Pending Verification
          </Badge>
        );
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{profile.status}</Badge>;
    }
  };

  return (
    <DashboardShell
      roleName="Broker"
      nav={nav}
      title="Broker Workspace"
      subtitle="Manage your authorized distribution, generate tracked share links, and review commission terms."
    >
      <div className="space-y-6">
        {/* Verification Alert / Status Header */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">
                {profile?.agencyName || user?.name || "Broker Account"}
              </h2>
              {statusBadge()}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {profile?.status === "verified"
                ? "You are authorized to distribute properties and earn verified commission."
                : "Submit or update your profile details for administrator review and verification."}
            </p>
          </div>
          {profile?.status === "verified" && (
            <div className="flex items-center gap-4 text-sm">
              <div className="rounded-lg border border-border px-3 py-2 text-center">
                <span className="block font-bold text-foreground">{authorizations.length}</span>
                <span className="text-xs text-muted-foreground">Authorizations</span>
              </div>
              <div className="rounded-lg border border-border px-3 py-2 text-center">
                <span className="block font-bold text-foreground">{listings.length}</span>
                <span className="text-xs text-muted-foreground">Active Listings</span>
              </div>
            </div>
          )}
        </div>

        <Tabs defaultValue="listings" className="w-full">
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="listings">Market Listings</TabsTrigger>
            <TabsTrigger value="prospects">Prospects</TabsTrigger>
            <TabsTrigger value="commissions">Commissions</TabsTrigger>
            <TabsTrigger value="authorizations">Authorizations</TabsTrigger>
            <TabsTrigger value="profile">Profile & Terms</TabsTrigger>
          </TabsList>

          {/* Listings Tab */}
          <TabsContent value="listings" className="mt-6 space-y-4">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Distributable Listings</h3>
                <p className="text-xs text-muted-foreground">
                  Listings matching your authorized properties and active commission agreements.
                </p>
              </div>

              {listings.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {profile?.status !== "verified"
                    ? "Your broker profile must be verified by an administrator to distribute listings."
                    : authorizations.length === 0
                      ? "No property or unit authorizations assigned yet. Contact property admins for access."
                      : "No active listings found under your current authorizations."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Listing</TableHead>
                        <TableHead>Property / Unit</TableHead>
                        <TableHead>Asking Rent</TableHead>
                        <TableHead>Distribution Link</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {listings.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.headline}</TableCell>
                          <TableCell>
                            <span className="block text-sm">{l.property.title}</span>
                            <span className="text-xs text-muted-foreground">
                              Unit {l.unit.unitNumber} • {l.unit.beds} Bed
                            </span>
                          </TableCell>
                          <TableCell>
                            {formatKES(l.askingRent)}
                            {l.serviceCharge > 0 && (
                              <span className="block text-xs text-muted-foreground">
                                + {formatKES(l.serviceCharge)} sc
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {l.published && l.shareUrl ? (
                              <div className="flex items-center gap-2">
                                <code className="rounded bg-muted px-2 py-0.5 text-xs">
                                  {l.shareCode}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => copyToClipboard(l.shareUrl, l.shareCode)}
                                >
                                  {copiedCode === l.shareCode ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                                <Link
                                  href={l.shareUrl}
                                  target="_blank"
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Not yet distributed
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {l.published ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => copyToClipboard(l.shareUrl, l.shareCode)}
                              >
                                Copy Link
                              </Button>
                            ) : (
                              <Button size="sm" onClick={() => handlePublish(l.id)}>
                                Get Share Link
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Prospects Tab */}
          <TabsContent value="prospects" className="mt-6 space-y-4">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Attributed Prospects</h3>
                <p className="text-xs text-muted-foreground">
                  Applications that originated from your tracked share links. Tenant contact details
                  are withheld — only reference codes and status are shown.
                </p>
              </div>

              {prospects.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No prospects yet. Share your listing links to start tracking attributed
                  applications.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Applied</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {prospects.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.referenceCode}</TableCell>
                        <TableCell className="font-medium">{p.unitHeadline}</TableCell>
                        <TableCell>{new Date(p.appliedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Pending / Eligible</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatKES(
                    commissions
                      .filter((c) => c.status === "pending" || c.status === "eligible")
                      .reduce((sum, c) => sum + (c.netMinor || 0), 0) / 100,
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Approved for payout</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatKES(
                    commissions
                      .filter((c) => c.status === "approved")
                      .reduce((sum, c) => sum + (c.netMinor || 0), 0) / 100,
                  )}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">Paid to date</p>
                <p className="mt-1 text-xl font-semibold">
                  {formatKES(
                    commissions
                      .filter((c) => c.status === "paid")
                      .reduce((sum, c) => sum + (c.netMinor || 0), 0) / 100,
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Commission Accruals</h3>
                <p className="text-xs text-muted-foreground">
                  Commission accrues from collected rent only. Payouts are released after finance
                  approval; tax is withheld at the agreed rate.
                </p>
              </div>

              {commissions.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No commission accrued yet. Accruals appear after a tenant&apos;s rent payment
                  settles on an attributed lease.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Basis</TableHead>
                        <TableHead>Gross</TableHead>
                        <TableHead>Tax</TableHead>
                        <TableHead>Net</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.map((c) => (
                        <TableRow key={c._id}>
                          <TableCell className="font-mono text-xs">{c.invoiceId}</TableCell>
                          <TableCell className="capitalize">
                            {String(c.kind).replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>{formatKES((c.grossMinor || 0) / 100)}</TableCell>
                          <TableCell>{formatKES((c.taxMinor || 0) / 100)}</TableCell>
                          <TableCell className="font-medium">
                            {formatKES((c.netMinor || 0) / 100)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                c.status === "paid"
                                  ? "default"
                                  : c.status === "reversed" || c.status === "disputed"
                                    ? "destructive"
                                    : "outline"
                              }
                              className="capitalize"
                            >
                              {c.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Authorizations Tab */}
          <TabsContent value="authorizations" className="mt-6 space-y-6">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Active Scope Authorizations</h3>
                <p className="text-xs text-muted-foreground">
                  Properties, blocks, or units you are authorized to represent.
                </p>
              </div>

              {authorizations.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No active property or unit authorizations.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Scope ID</TableHead>
                      <TableHead>Property ID</TableHead>
                      <TableHead>Granted Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authorizations.map((a) => (
                      <TableRow key={a._id}>
                        <TableCell className="font-medium capitalize">{a.scopeType}</TableCell>
                        <TableCell className="font-mono text-xs">{a.scopeId}</TableCell>
                        <TableCell className="font-mono text-xs">{a.propertyId}</TableCell>
                        <TableCell>{new Date(a.grantedAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={a.status === "active" ? "default" : "destructive"}>
                            {a.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border p-4">
                <h3 className="font-semibold">Commission Agreements</h3>
                <p className="text-xs text-muted-foreground">
                  Agreed commercial commission terms associated with your authorizations.
                </p>
              </div>

              {agreements.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No commission agreements found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Basis</TableHead>
                      <TableHead>Rate / Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agreements.map((agr) => (
                      <TableRow key={agr._id}>
                        <TableCell className="font-medium capitalize">
                          {agr.scopeType} ({agr.scopeId})
                        </TableCell>
                        <TableCell className="capitalize">{agr.basis.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          {agr.basis === "percentage_of_rent"
                            ? `${(agr.rateBps ?? 0) / 100}%`
                            : agr.basis === "fixed"
                              ? formatKES((agr.fixedAmountMinor ?? 0) / 100)
                              : "100% of 1st Month Rent"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              agr.status === "active"
                                ? "default"
                                : agr.status === "draft"
                                  ? "outline"
                                  : "destructive"
                            }
                          >
                            {agr.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {agr.status === "draft" && (
                            <Button size="sm" onClick={() => handleAcceptAgreement(agr._id)}>
                              Accept Terms
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

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6">
            <div className="rounded-xl border border-border bg-card p-6 max-w-2xl">
              <h3 className="text-lg font-semibold">Broker Profile Information</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Your profile information is reviewed by platform administrators for verification.
              </p>

              <form onSubmit={handleSaveProfile} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="agencyName">Agency Name</Label>
                    <Input
                      id="agencyName"
                      placeholder="e.g. Apex Real Estate"
                      value={agencyName}
                      onChange={(e) => setAgencyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="licenseNumber">Estate Agent License #</Label>
                    <Input
                      id="licenseNumber"
                      placeholder="e.g. EARB/2026/1234"
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input
                      id="phone"
                      placeholder="+254..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Business Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="broker@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <h4 className="font-medium text-sm">Payout Method</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div className="space-y-2">
                      <Label htmlFor="payoutType">Payout Type</Label>
                      <select
                        id="payoutType"
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={payoutType}
                        onChange={(e) => setPayoutType(e.target.value as "mpesa" | "bank" | "none")}
                      >
                        <option value="none">Select later</option>
                        <option value="mpesa">M-Pesa</option>
                        <option value="bank">Bank Account</option>
                      </select>
                    </div>

                    {payoutType !== "none" && (
                      <div className="space-y-2">
                        <Label htmlFor="accountNumber">
                          {payoutType === "mpesa" ? "M-Pesa Phone Number" : "Account Number / IBAN"}
                        </Label>
                        <Input
                          id="accountNumber"
                          placeholder={payoutType === "mpesa" ? "+254700000000" : "Bank Account #"}
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? "Saving..." : "Save Profile Information"}
                  </Button>
                </div>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardShell>
  );
}
