"use client";

import {
  ArrowLeft,
  Bath,
  BedDouble,
  Check,
  CheckCircle2,
  DoorOpen,
  MapPin,
  Maximize2,
  Share2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { PublicListingProjection } from "@/lib/listings";

export default function ListingDetailPage() {
  const { id } = useParams();
  const listingIdOrShareCode = typeof id === "string" ? id : "";
  const [listing, setListing] = useState<PublicListingProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applyForm, setApplyForm] = useState({ name: "", email: "", phone: "", message: "" });
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!listingIdOrShareCode) return;
    setLoading(true);

    fetch(`/api/v1/marketplace/listings/${listingIdOrShareCode}`)
      .then((res) => {
        if (!res.ok) throw new Error("Listing not found");
        return res.json();
      })
      .then((data) => {
        setListing(data.listing);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [listingIdOrShareCode]);

  const copyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      toast({
        title: "Link copied!",
        description: "Listing share URL copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = async () => {
    if (!listing) return;
    if (!user) {
      router.push(`/auth/login?redirect=/marketplace/${listingIdOrShareCode}`);
      return;
    }

    setSubmitting(true);
    try {
      const referralCode =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("ref") || ""
          : "";
      const res = await fetch("/api/v1/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: listing.property.id,
          unitId: listing.unit.id,
          unitName: listing.unit.name,
          name: user.name || "",
          email: user.email || "",
          listingId: listing.id,
          shareCode: referralCode || listing.publisher?.shareCode || undefined,
          message:
            applyForm.message || `Application for Unit ${listing.unit.name} (${listing.headline})`,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit application");
      }

      toast({
        title: "Application submitted!",
        description: "The property manager has received your tenancy application.",
      });
      setApplyOpen(false);
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err.message || "Could not submit application.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="py-24 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading unit listing...</p>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-24 text-center">
          <h2 className="text-2xl font-bold">Listing Unavailable</h2>
          <p className="mt-2 text-muted-foreground">
            This unit listing may have been leased, paused, or withdrawn.
          </p>
          <Button asChild className="mt-6">
            <Link href="/marketplace">Browse Other Units</Link>
          </Button>
        </div>
      </div>
    );
  }

  const images = listing.media?.length
    ? listing.media.map((m) => m.url)
    : [
        "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80",
      ];

  return (
    <div className="min-h-screen bg-background pb-16">
      <SiteHeader />
      <div className="container py-8">
        <Link
          href="/marketplace"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Marketplace
        </Link>

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-primary border-primary/20">
                Unit {listing.unit.name}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {listing.property.type}
              </Badge>
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {listing.headline}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              <span>
                {listing.property.title} — {listing.property.location}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={copyShareLink}>
              {copied ? (
                <Check className="mr-1.5 h-4 w-4 text-emerald-500" />
              ) : (
                <Share2 className="mr-1.5 h-4 w-4" />
              )}
              {copied ? "Copied" : "Share"}
            </Button>
          </div>
        </div>

        {/* Gallery */}
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl md:col-span-2">
            <Image src={images[0]} alt={listing.headline} fill priority className="object-cover" />
          </div>
          <div className="grid grid-rows-2 gap-4">
            {images.slice(1, 3).map((img, i) => (
              <div key={i} className="relative aspect-[16/10] overflow-hidden rounded-2xl">
                <Image src={img} alt="" fill className="object-cover" />
              </div>
            ))}
            {images.length <= 1 && (
              <div className="flex items-center justify-center rounded-2xl border border-dashed bg-muted text-xs text-muted-foreground">
                More photos coming soon
              </div>
            )}
          </div>
        </div>

        {/* Layout: Main Specs + Sticky Sidebar */}
        <div className="mt-10 grid gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-8">
            {/* Quick Specs */}
            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BedDouble className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bedrooms</p>
                  <p className="font-semibold text-foreground">{listing.unit.beds} Beds</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Bath className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bathrooms</p>
                  <p className="font-semibold text-foreground">{listing.unit.baths} Baths</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <DoorOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Floor</p>
                  <p className="font-semibold text-foreground">
                    {listing.unit.floorLabel || `Level ${listing.unit.floorLevel}`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Maximize2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Area</p>
                  <p className="font-semibold text-foreground">
                    {listing.unit.area ? `${listing.unit.area} m²` : "Standard"}
                  </p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-3">
              <h2 className="text-xl font-bold">About this Unit</h2>
              <p className="whitespace-pre-line text-muted-foreground leading-relaxed">
                {listing.description || "Spacious, comfortable unit available for lease."}
              </p>
            </div>

            {/* Amenities */}
            {listing.amenities?.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xl font-bold">Amenities & Features</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {listing.amenities.map((amenity) => (
                    <div
                      key={amenity}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pricing & Application Card */}
          <div className="lg:col-span-4">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6 shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Asking Rent
              </p>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  KES {listing.askingRent.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Service Charge</span>
                  <span className="font-medium text-foreground">
                    KES {listing.serviceCharge.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Security Deposit</span>
                  <span className="font-medium text-foreground">
                    {listing.depositMonths} month{listing.depositMonths > 1 ? "s" : ""} (KES{" "}
                    {(listing.askingRent * listing.depositMonths).toLocaleString()})
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Minimum Stay</span>
                  <span className="font-medium text-foreground">
                    {listing.minimumStayMonths} month{listing.minimumStayMonths > 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
                <DialogTrigger asChild>
                  <Button className="mt-6 w-full" size="lg">
                    Apply for this Unit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Apply for Unit {listing.unit.name}</DialogTitle>
                    <DialogDescription>
                      Submit your application directly to the property administration.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    <div className="space-y-1">
                      <Label>Introduction Note / Message</Label>
                      <Textarea
                        rows={3}
                        placeholder="Tell the landlord when you'd like to move in..."
                        value={applyForm.message}
                        onChange={(e) =>
                          setApplyForm((prev) => ({ ...prev, message: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setApplyOpen(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleApply} disabled={submitting}>
                      {submitting ? "Submitting..." : "Submit Application"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Verified Vacant Unit • Secure Application Flow
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
