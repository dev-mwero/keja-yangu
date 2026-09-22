"use client";

import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type VerifyState =
  | { status: "checking" }
  | { status: "success" }
  | { status: "error"; message: string };

const VerifyForm = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<VerifyState>({ status: "checking" });
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [emailSent, setEmailSent] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: "This verification link is missing a token." });
      return;
    }

    let cancelled = false;
    const verify = async () => {
      try {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify-email", token }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", message: data.error || "Verification failed" });
          return;
        }
        setState({ status: "success" });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Something went wrong. Please try again." });
        }
      }
    };
    void verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const onResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResending(true);
    setEmailSent(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend-verification", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend verification email");
      }
      setEmailSent(email);
      toast.success("Verification email sent");
    } catch (err) {
      toast.error("Resend failed", {
        description: err instanceof Error ? err.message : "Please try again later.",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout title="Verify your email" subtitle="Confirming your account.">
      {state.status === "checking" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </div>
      )}

      {state.status === "success" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">Email verified</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is now active. Sign in to get started.
            </p>
          </div>
          <Button asChild className="w-full rounded-full">
            <Link href="/auth">Sign in</Link>
          </Button>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-6 w-6 text-destructive" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold">Verification failed</h2>
            <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          </div>

          <form onSubmit={onResend} className="w-full space-y-3 border-t border-border pt-5">
            <Label htmlFor="resend-email" className="text-left">
              Enter your email to resend the verification link
            </Label>
            <Input
              id="resend-email"
              type="email"
              placeholder="you@keja.co"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" className="w-full rounded-full" disabled={resending}>
              {resending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              Resend verification email
            </Button>
          </form>

          {emailSent && (
            <p className="text-xs text-muted-foreground">
              A new link was sent to <strong>{emailSent}</strong>. Check your inbox.
            </p>
          )}

          <Button asChild variant="ghost" className="w-full rounded-full">
            <Link href="/auth">Back to sign in</Link>
          </Button>
        </div>
      )}
    </AuthLayout>
  );
};

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
