"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, MapPin, Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { BRAND } from "@/lib/brand";
import { contactInput } from "@/lib/schemas/contact";

type FormValues = z.infer<typeof contactInput>;

export default function ContactForm() {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(contactInput) });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to send message");
      }
      toast({
        title: "Message sent",
        description: "We'll get back to you within one business day.",
      });
      reset();
    } catch (err) {
      toast({
        title: "Could not send message",
        description: err instanceof Error ? err.message : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-16 md:py-24">
        <div className="mx-auto max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">Contact</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-5xl">
            Get in touch
          </h1>
          <p className="mt-4 text-muted-foreground">
            Have a question about a listing, a lease, or the platform? Send us a message and we'll
            reply within one business day.
          </p>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
            <a
              href={`mailto:${BRAND.emails.support}`}
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="h-4 w-4" /> {BRAND.emails.support}
            </a>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> Nairobi, Kenya
            </span>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-10 space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" autoComplete="name" {...register("name")} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" {...register("email")} />
                {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" {...register("subject")} />
              {errors.subject && (
                <p className="text-sm text-destructive">{errors.subject.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" rows={6} {...register("message")} />
              {errors.message && (
                <p className="text-sm text-destructive">{errors.message.message}</p>
              )}
            </div>

            <Button type="submit" size="lg" className="rounded-full px-6" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" /> Send message
                </>
              )}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
