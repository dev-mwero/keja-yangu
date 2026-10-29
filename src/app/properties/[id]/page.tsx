"use client";

import { ArrowLeft, Bath, BedDouble, Check, MapPin, Maximize2, Send } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PropertyMap } from "@/components/PropertyMap";
import { PropertyFavoriteButton } from "@/components/property/PropertyFavoriteButton";
import { PropertyLightbox } from "@/components/property/PropertyLightbox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApplicationMutations, useApplications } from "@/hooks/use-applications";
import { useAuth } from "@/hooks/use-auth";
import { type PropertyUnit, useProperty } from "@/hooks/use-properties";
import { useToast } from "@/hooks/use-toast";
import { formatKES } from "@/lib/format";
import { applicationFormSchema } from "@/lib/schemas/application";

const PropertyDetails = () => {
  const { id } = useParams();
  const propertyId = typeof id === "string" ? id : undefined;
  const { property, loading } = useProperty(propertyId);
  const [active, setActive] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const { create } = useApplicationMutations();
  const { applications } = useApplications(undefined, { enabled: user?.role === "tenant" });
  const [open, setOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<PropertyUnit | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [unitSummary, setUnitSummary] = useState<{
    totalUnits: number;
    byStatus: { available: number; occupied: number; maintenance: number };
    floors: Array<{
      label: string;
      level: number;
      block: string | null;
      total: number;
      available: number;
      occupied: number;
      maintenance: number;
    }>;
  } | null>(null);
  const [unitSummaryError, setUnitSummaryError] = useState<string | null>(null);
  const [unitDetailsByProperty, setUnitDetailsByProperty] = useState<
    Record<string, PropertyUnit[]>
  >({});
  const [unitLoadingByProperty, setUnitLoadingByProperty] = useState<Record<string, boolean>>({});
  const [unitErrorsByProperty, setUnitErrorsByProperty] = useState<Record<string, string>>({});
  const unitDetails = propertyId ? (unitDetailsByProperty[propertyId] ?? []) : [];
  const unitsLoaded = Boolean(propertyId && Object.hasOwn(unitDetailsByProperty, propertyId));
  const unitsLoading = Boolean(propertyId && unitLoadingByProperty[propertyId]);
  const unitsError = propertyId ? unitErrorsByProperty[propertyId] : null;

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    fetch(`/api/v1/properties/${propertyId}/unit-summary`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load unit summary");
        if (!cancelled) setUnitSummary(body.data);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setUnitSummaryError(
            error instanceof Error ? error.message : "Could not load unit summary",
          );
        }
      });

    if (userId) {
      fetch(`/api/v1/properties/${propertyId}/view`, { method: "POST" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Could not update recently viewed homes");
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            toast({
              title: "Could not update recently viewed homes",
              description: error instanceof Error ? error.message : "Please try again.",
              variant: "destructive",
            });
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [propertyId, userId, toast]);

  const loadUnitDetails = async () => {
    if (
      !propertyId ||
      Object.hasOwn(unitDetailsByProperty, propertyId) ||
      unitLoadingByProperty[propertyId]
    ) {
      return;
    }
    const loadingPropertyId = propertyId;
    setUnitLoadingByProperty((current) => ({ ...current, [loadingPropertyId]: true }));
    setUnitErrorsByProperty((current) => {
      const next = { ...current };
      delete next[loadingPropertyId];
      return next;
    });
    try {
      const response = await fetch(`/api/v1/properties/${loadingPropertyId}?includeUnits=1`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load available units");
      setUnitDetailsByProperty((current) => ({
        ...current,
        [loadingPropertyId]: body.data.units ?? [],
      }));
    } catch (error) {
      setUnitErrorsByProperty((current) => ({
        ...current,
        [loadingPropertyId]:
          error instanceof Error ? error.message : "Could not load available units",
      }));
    } finally {
      setUnitLoadingByProperty((current) => ({ ...current, [loadingPropertyId]: false }));
    }
  };

  // Prefill the applicant's details whenever the dialog opens, whether it was
  // opened from the general button or a specific unit's "Request" button.
  useEffect(() => {
    if (!open || user?.role !== "tenant") return;
    const name = user.name || "";
    const email = user.email || "";
    setForm((f) => (f.name === name && f.email === email ? f : { ...f, name, email }));
  }, [open, user?.role, user?.name, user?.email]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-32 text-center">
          <p className="text-muted-foreground">Loading property…</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-32 text-center">
          <h1 className="font-display text-3xl">Property not found</h1>
          <Button asChild className="mt-6">
            <Link href="/properties">Back to listings</Link>
          </Button>
        </div>
      </div>
    );
  }

  const alreadyPending =
    user?.role === "tenant" && property
      ? applications.some((a) => a.propertyId === property._id && a.status === "pending")
      : false;

  const gallery = property.images.length > 0 ? property.images : ["/images/property-1.jpg"];
  const safeActive = Math.min(active, gallery.length - 1);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;

    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need a tenant account to submit an application.",
      });
      router.push(`/auth?from=/properties/${property._id}`);
      return;
    }
    if (user.role !== "tenant") {
      toast({
        title: "Tenants only",
        description: "Only tenant accounts can apply for a home.",
        variant: "destructive",
      });
      return;
    }
    if (alreadyPending) {
      toast({
        title: "Already submitted",
        description: "You already have a pending application for this home.",
      });
      return;
    }

    const result = applicationFormSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((iss) => {
        const key = iss.path[0] as keyof typeof errors;
        if (key && !fieldErrors[key]) fieldErrors[key] = iss.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      await create({
        propertyId: property._id,
        unitId: selectedUnit?._id,
        name: result.data.name,
        email: result.data.email,
        message: result.data.message,
      });
      toast({
        title: "Application submitted",
        description: selectedUnit
          ? `Your request for unit ${selectedUnit.name} at ${property.title} is now pending.`
          : `Your request for ${property.title} is now pending.`,
      });
      setOpen(false);
      setForm({ name: "", email: "", message: "" });
      setErrors({});
      router.push("/dashboard/tenant/requests");
    } catch (err) {
      toast({
        title: "Could not submit application",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container py-8">
        <Link
          href="/properties"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to properties
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          {/* Gallery + content */}
          <div className="lg:col-span-8">
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label="Open photo gallery"
              className="group block w-full overflow-hidden rounded-3xl shadow-elevated"
            >
              <div className="aspect-[16/10] bg-muted relative">
                <Image
                  src={gallery[safeActive]}
                  alt={property.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
                {gallery.length > 1 && (
                  <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white tabular-nums backdrop-blur">
                    {safeActive + 1} / {gallery.length}
                  </span>
                )}
              </div>
            </button>
            {gallery.length > 1 && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {gallery.map((img, i) => (
                  <button
                    type="button"
                    key={`${img}-${i}`}
                    onClick={() => setActive(i)}
                    className={`overflow-hidden rounded-xl transition-all ${
                      safeActive === i
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    <div className="aspect-[4/3] relative">
                      <Image src={img} alt="" fill className="object-cover" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-10">
              <Badge variant="outline" className="rounded-full capitalize">
                {property.type}
              </Badge>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl text-balance">
                {property.title}
              </h1>
              {property.status === "available" && property.published && (
                <div className="mt-4">
                  <PropertyFavoriteButton propertyId={property._id} />
                </div>
              )}
              <p className="mt-3 inline-flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {property.location}
              </p>

              <div className="mt-6 flex flex-wrap gap-6 text-sm">
                <span className="inline-flex items-center gap-2">
                  <BedDouble className="h-4 w-4 text-primary" />
                  {property.beds} bed
                </span>
                <span className="inline-flex items-center gap-2">
                  <Bath className="h-4 w-4 text-primary" />
                  {property.baths} bath
                </span>
                <span className="inline-flex items-center gap-2">
                  <Maximize2 className="h-4 w-4 text-primary" />
                  {property.area} m²
                </span>
              </div>

              <Tabs defaultValue="overview" className="mt-10">
                <TabsList className="rounded-full">
                  <TabsTrigger value="overview" className="rounded-full">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="amenities" className="rounded-full">
                    Amenities
                  </TabsTrigger>
                  <TabsTrigger value="location" className="rounded-full">
                    Location
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-6">
                  <p className="text-lg leading-relaxed text-muted-foreground text-balance">
                    {property.description}
                  </p>
                </TabsContent>
                <TabsContent value="amenities" className="mt-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {property.amenities.map((a) => (
                      <div
                        key={a}
                        className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm"
                      >
                        <Check className="h-4 w-4 text-primary" />
                        {a}
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="location" className="mt-6">
                  <PropertyMap address={property.location} title={property.title} />
                </TabsContent>
              </Tabs>
            </div>

            <section className="mt-10" aria-labelledby="available-units-heading">
              <h2
                id="available-units-heading"
                className="font-display text-2xl font-semibold tracking-tight"
              >
                Available units
              </h2>
              {unitSummaryError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {unitSummaryError}
                </p>
              )}
              {unitSummary && (
                <div className="mt-4 space-y-4 rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="rounded-full bg-muted px-3 py-1">
                      {unitSummary.totalUnits} total units
                    </span>
                    <span className="rounded-full bg-success/15 px-3 py-1 text-success">
                      {unitSummary.byStatus.available} available
                    </span>
                    <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
                      {unitSummary.byStatus.occupied} occupied
                    </span>
                    <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">
                      {unitSummary.byStatus.maintenance} maintenance
                    </span>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2" aria-label="Unit availability by floor">
                    {unitSummary.floors.map((floor) => (
                      <li
                        key={`${floor.block ?? "none"}-${floor.level}-${floor.label}`}
                        className="rounded-xl border border-border px-3 py-2 text-sm"
                      >
                        <span className="font-medium">
                          {floor.block ? `Block ${floor.block} · ` : ""}
                          {floor.label === "Ground" ? "Ground floor" : `Floor ${floor.label}`}
                        </span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {floor.available} of {floor.total} available
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {property.status !== "available" ? (
                <p className="mt-3 text-muted-foreground">
                  This home is not accepting applications right now.
                </p>
              ) : (
                <details
                  className="mt-4"
                  onToggle={(event) => {
                    if (event.currentTarget.open) void loadUnitDetails();
                  }}
                >
                  <summary className="cursor-pointer text-sm font-medium text-primary">
                    View and request a specific unit
                  </summary>
                  {unitsLoading && (
                    <p className="mt-3 text-sm text-muted-foreground">Loading units...</p>
                  )}
                  {unitsError && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      {unitsError}
                    </p>
                  )}
                  {unitsLoaded && unitDetails.length === 0 && (
                    <p className="mt-3 text-muted-foreground">
                      No units are listed right now. Submit a general request and the caretaker will
                      suggest one.
                    </p>
                  )}
                  {unitsLoaded && unitDetails.length > 0 && (
                    <ul aria-label="Available units" className="mt-4 grid gap-3 sm:grid-cols-2">
                      {unitDetails.map((unit) => (
                        <li
                          key={unit._id}
                          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-display text-lg font-semibold">
                                Unit {unit.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {unit.blockName ? `Block ${unit.blockName} · ` : ""}
                                Floor {unit.floorLabel || unit.floorLevel}
                              </div>
                            </div>
                            <div className="text-right text-sm font-medium">
                              {formatKES(unit.rent ?? property.price)}
                              <div className="text-xs font-normal text-muted-foreground">
                                / month
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <BedDouble className="h-3.5 w-3.5" /> {unit.beds} bed
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Bath className="h-3.5 w-3.5" /> {unit.baths} bath
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Maximize2 className="h-3.5 w-3.5" /> {unit.area} m²
                            </span>
                          </div>
                          <Button
                            size="sm"
                            className="rounded-full"
                            disabled={alreadyPending}
                            aria-label={`Request ${unit.name}`}
                            onClick={() => {
                              setSelectedUnit(unit);
                              setOpen(true);
                            }}
                          >
                            <Send className="mr-2 h-3.5 w-3.5" />
                            Request this unit
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </section>
          </div>

          {/* Sticky sidebar */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6 shadow-elevated">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Monthly
                  </div>
                  <div className="font-display text-3xl font-semibold">
                    KES {property.price.toLocaleString()}
                  </div>
                </div>
                <Badge
                  className={`capitalize ${
                    property.status === "available"
                      ? "bg-success/15 text-success hover:bg-success/20"
                      : property.status === "occupied"
                        ? "bg-muted text-muted-foreground"
                        : "bg-warning/15 text-warning hover:bg-warning/20"
                  }`}
                >
                  {property.status}
                </Badge>
              </div>

              <Dialog
                open={open}
                onOpenChange={(o) => {
                  setOpen(o);
                }}
              >
                <DialogTrigger asChild>
                  <Button
                    className="mt-6 w-full rounded-full"
                    size="lg"
                    disabled={property.status !== "available" || alreadyPending}
                    onClick={() => setSelectedUnit(null)}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {property.status !== "available"
                      ? "Not available"
                      : alreadyPending
                        ? "Application pending"
                        : "Apply for this home"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-display text-2xl">
                      {selectedUnit
                        ? `Request ${selectedUnit.name} · ${property.title}`
                        : `Apply for ${property.title}`}
                    </DialogTitle>
                    <DialogDescription>
                      Send a quick request. The caretaker will review within 24 hours.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleApply} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Full name</Label>
                      <Input
                        id="name"
                        required
                        maxLength={100}
                        placeholder="Your name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs text-destructive">{errors.name}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        maxLength={255}
                        placeholder="you@example.com"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                      {errors.email && (
                        <p className="mt-1 text-xs text-destructive">{errors.email}</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="msg">Message</Label>
                      <Textarea
                        id="msg"
                        maxLength={500}
                        placeholder="Move-in date, questions…"
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      />
                      {errors.message && (
                        <p className="mt-1 text-xs text-destructive">{errors.message}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="w-full rounded-full" disabled={submitting}>
                        {submitting ? "Submitting…" : "Submit request"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium capitalize">{property.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Area</span>
                  <span className="font-medium">{property.area} m²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Caretakers</span>
                  <span className="font-medium">{property.caretakerIds?.length ?? 0}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <PropertyLightbox
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          images={gallery}
          title={property.title}
          index={safeActive}
          onIndexChange={setActive}
        />
      </div>
    </div>
  );
};

export default PropertyDetails;
