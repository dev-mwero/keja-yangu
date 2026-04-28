import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, MapPin, BedDouble, Bath, Maximize2, Check, Send } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertyMap } from "@/components/PropertyMap";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { properties } from "@/data/properties";
import { useAuth } from "@/hooks/use-auth";
import {
  applicationInputSchema,
  createApplication,
  hasPendingApplication,
} from "@/lib/applications";

const PropertyDetails = () => {
  const { id } = useParams();
  const property = properties.find((p) => p.id === id);
  const [active, setActive] = useState(0);
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});

  if (!property) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="container py-32 text-center">
          <h1 className="font-display text-3xl">Property not found</h1>
          <Button asChild className="mt-6"><Link to="/properties">Back to listings</Link></Button>
        </div>
      </div>
    );
  }

  const alreadyPending =
    user?.role === "tenant" && property
      ? hasPendingApplication(user.email, property.id)
      : false;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!property) return;

    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need a tenant account to submit an application.",
      });
      sessionStorage.setItem("keja-redirect", `/properties/${property.id}`);
      navigate("/auth");
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

    const result = applicationInputSchema.safeParse(form);
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
      createApplication({
        tenantEmail: user.email,
        propertyId: property.id,
        propertyTitle: property.title,
        input: result.data,
      });
      toast({
        title: "Application submitted",
        description: `Your request for ${property.title} is now pending.`,
      });
      setOpen(false);
      setForm({ name: "", email: "", message: "" });
      setErrors({});
      navigate("/dashboard/tenant/applications");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="container py-8">
        <Link to="/properties" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to properties
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-12">
          {/* Gallery + content */}
          <div className="lg:col-span-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="overflow-hidden rounded-3xl shadow-elevated"
            >
              <div className="aspect-[16/10] bg-muted">
                <img
                  src={property.images[active]}
                  alt={property.title}
                  className="h-full w-full object-cover"
                />
              </div>
            </motion.div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {property.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={`overflow-hidden rounded-xl transition-all ${
                    active === i ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <img src={img} alt="" className="aspect-[4/3] h-full w-full object-cover" />
                </button>
              ))}
            </div>

            <div className="mt-10">
              <Badge variant="outline" className="rounded-full capitalize">{property.type}</Badge>
              <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl text-balance">
                {property.title}
              </h1>
              <p className="mt-3 inline-flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {property.location}
              </p>

              <div className="mt-6 flex flex-wrap gap-6 text-sm">
                <span className="inline-flex items-center gap-2"><BedDouble className="h-4 w-4 text-primary" />{property.beds} bed</span>
                <span className="inline-flex items-center gap-2"><Bath className="h-4 w-4 text-primary" />{property.baths} bath</span>
                <span className="inline-flex items-center gap-2"><Maximize2 className="h-4 w-4 text-primary" />{property.area} m²</span>
              </div>

              <Tabs defaultValue="overview" className="mt-10">
                <TabsList className="rounded-full">
                  <TabsTrigger value="overview" className="rounded-full">Overview</TabsTrigger>
                  <TabsTrigger value="amenities" className="rounded-full">Amenities</TabsTrigger>
                  <TabsTrigger value="location" className="rounded-full">Location</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-6">
                  <p className="text-lg leading-relaxed text-muted-foreground text-balance">{property.description}</p>
                </TabsContent>
                <TabsContent value="amenities" className="mt-6">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {property.amenities.map((a) => (
                      <div key={a} className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                        <Check className="h-4 w-4 text-primary" />{a}
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="location" className="mt-6">
                  <PropertyMap address={property.location} title={property.title} />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Sticky sidebar */}
          <aside className="lg:col-span-4">
            <div className="sticky top-24 rounded-2xl border border-border bg-card p-6 shadow-elevated">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Monthly</div>
                  <div className="font-display text-3xl font-semibold">KES {property.price.toLocaleString()}</div>
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

              <Dialog open={open} onOpenChange={(o) => {
                setOpen(o);
                if (o && user?.role === "tenant") {
                  setForm((f) => ({
                    ...f,
                    name: f.name || user.name || "",
                    email: f.email || user.email || "",
                  }));
                }
              }}>
                <DialogTrigger asChild>
                  <Button
                    className="mt-6 w-full rounded-full"
                    size="lg"
                    disabled={property.status !== "available" || alreadyPending}
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
                    <DialogTitle className="font-display text-2xl">Apply for {property.title}</DialogTitle>
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
                      {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
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
                      {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
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
                      {errors.message && <p className="mt-1 text-xs text-destructive">{errors.message}</p>}
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
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{property.type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Area</span><span className="font-medium">{property.area} m²</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Caretakers</span><span className="font-medium">{property.caretakerIds.length}</span></div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetails;