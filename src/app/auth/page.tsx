"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Role, useAuth } from "@/hooks/use-auth";

const signInSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
});

const signUpSchema = z.object({
  name: z.string().min(2, "Tell us your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "At least 6 characters"),
  role: z.enum(["tenant", "caretaker", "owner"]),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

const roleRoute: Record<Role, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  owner: "/dashboard/owner",
  "system-admin": "/dashboard/system-admin",
};

const AuthForm = () => {
  const router = useRouter();
  const { signIn, signUp, resendVerification } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const signInForm = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", role: "tenant" },
  });

  const onSignIn = async (values: SignInValues) => {
    setSubmitting(true);
    try {
      const signedInUser = await signIn(values.email, values.password);
      router.push(roleRoute[signedInUser.role]);
    } catch {
      // Error handled by toast in hook
    } finally {
      setSubmitting(false);
    }
  };

  const onSignUp = async (values: SignUpValues) => {
    setSubmitting(true);
    try {
      await signUp(values.name, values.email, values.password, values.role);
      setPendingEmail(values.email);
    } catch {
      // Error handled by toast in hook
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!pendingEmail) return;
    setResending(true);
    try {
      await resendVerification(pendingEmail);
    } catch {
      // Error handled by toast in hook
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout
      title={
        pendingEmail
          ? "Check your inbox"
          : tab === "signin"
            ? "Welcome back"
            : "Create your account"
      }
      subtitle={
        pendingEmail
          ? "One more step to get you home."
          : tab === "signin"
            ? "Sign in to continue to Keja."
            : "Join as a tenant, caretaker, or owner."
      }
    >
      {pendingEmail ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" />
          </span>
          <p className="text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <strong className="text-foreground">{pendingEmail}</strong>. Open it to activate your
            account — and check your spam folder if you can't find it.
          </p>
          <Button
            variant="outline"
            className="w-full rounded-full"
            disabled={resending}
            onClick={onResend}
          >
            {resending && <Loader2 className="h-4 w-4 animate-spin" />} Resend verification email
          </Button>
          <Button
            variant="ghost"
            className="w-full rounded-full"
            onClick={() => {
              setPendingEmail(null);
            }}
          >
            Back to sign in
          </Button>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")} className="mt-8">
          <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted p-1">
            <TabsTrigger value="signin" className="rounded-full">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="rounded-full">
              Create account
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-6">
            <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="si-email">Email</Label>
                <Input
                  id="si-email"
                  type="email"
                  placeholder="you@keja.co"
                  {...signInForm.register("email")}
                />
                {signInForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {signInForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="si-pw">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="si-pw"
                  type="password"
                  placeholder="••••••••"
                  {...signInForm.register("password")}
                />
                {signInForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {signInForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full rounded-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Sign in
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-6">
            <form onSubmit={signUpForm.handleSubmit(onSignUp)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="su-name">Full name</Label>
                <Input id="su-name" placeholder="Amina Otieno" {...signUpForm.register("name")} />
                {signUpForm.formState.errors.name && (
                  <p className="text-xs text-destructive">
                    {signUpForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-email">Email</Label>
                <Input
                  id="su-email"
                  type="email"
                  placeholder="you@keja.co"
                  {...signUpForm.register("email")}
                />
                {signUpForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {signUpForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="su-pw">Password</Label>
                <Input
                  id="su-pw"
                  type="password"
                  placeholder="At least 6 characters"
                  {...signUpForm.register("password")}
                />
                {signUpForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {signUpForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>I am a</Label>
                <RadioGroup
                  value={signUpForm.watch("role")}
                  onValueChange={(v) => signUpForm.setValue("role", v as SignUpValues["role"])}
                  className="grid grid-cols-3 gap-2"
                >
                  {(["tenant", "caretaker", "owner"] as const).map((r) => (
                    <Label
                      key={r}
                      htmlFor={`role-${r}`}
                      className="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium capitalize transition-all hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:text-primary"
                    >
                      <RadioGroupItem id={`role-${r}`} value={r} className="sr-only" />
                      {r}
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <Button type="submit" className="w-full rounded-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      )}
    </AuthLayout>
  );
};

export default function Auth() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <AuthForm />
    </Suspense>
  );
}
