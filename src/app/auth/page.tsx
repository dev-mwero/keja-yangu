"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/hooks/use-auth";

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

const roleRoute: Record<string, string> = {
  tenant: "/dashboard/tenant",
  caretaker: "/dashboard/caretaker",
  owner: "/dashboard/owner",
};

const AuthForm = () => {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);

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
      await signIn(values.email, values.password);
      router.push(roleRoute[values.email.startsWith("owner") ? "owner" : values.email.startsWith("care") ? "caretaker" : "tenant"]);
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
      router.push(roleRoute[values.role]);
    } catch {
      // Error handled by toast in hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <Image
            src="/images/hero-building.jpg"
            alt="Modern apartment building"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="absolute inset-0 h-full w-full object-cover"
          />
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/80 via-secondary/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10 text-secondary-foreground">
          <Logo className="text-secondary-foreground" />
          <div className="max-w-md">
            <p className="text-xs font-medium uppercase tracking-widest text-primary-glow">The new way to rent</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">Where home <span className="italic text-primary-glow">begins</span>.</h2>
            <p className="mt-4 text-sm text-secondary-foreground/70">Sign in to track applications, manage units, or oversee your portfolio — all in one calm, modern space.</p>
          </div>
        </div>
      </div>

      <div className="relative flex min-h-screen flex-col px-6 py-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
          <Logo className="lg:hidden" />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-4xl font-semibold tracking-tight">{tab === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{tab === "signin" ? "Sign in to continue to Keja." : "Join as a tenant, caretaker, or owner."}</p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")} className="mt-8">
            <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted p-1">
              <TabsTrigger value="signin" className="rounded-full">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={signInForm.handleSubmit(onSignIn)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" placeholder="you@keja.co" {...signInForm.register("email")} />
                  {signInForm.formState.errors.email && <p className="text-xs text-destructive">{signInForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pw">Password</Label>
                  <Input id="si-pw" type="password" placeholder="••••••••" {...signInForm.register("password")} />
                  {signInForm.formState.errors.password && <p className="text-xs text-destructive">{signInForm.formState.errors.password.message}</p>}
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
                  {signUpForm.formState.errors.name && <p className="text-xs text-destructive">{signUpForm.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" placeholder="you@keja.co" {...signUpForm.register("email")} />
                  {signUpForm.formState.errors.email && <p className="text-xs text-destructive">{signUpForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" type="password" placeholder="At least 6 characters" {...signUpForm.register("password")} />
                  {signUpForm.formState.errors.password && <p className="text-xs text-destructive">{signUpForm.formState.errors.password.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>I am a</Label>
                  <RadioGroup value={signUpForm.watch("role")} onValueChange={(v) => signUpForm.setValue("role", v as SignUpValues["role"])} className="grid grid-cols-3 gap-2">
                    {(["tenant", "caretaker", "owner"] as const).map((r) => (
                      <Label key={r} htmlFor={`role-${r}`} className="flex cursor-pointer items-center justify-center rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium capitalize transition-all hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:text-primary">
                        <RadioGroupItem id={`role-${r}`} value={r} className="sr-only" />{r}
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
        </div>

        <p className="text-center text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Keja</p>
      </div>
    </div>
  );
};

export default function Auth() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <AuthForm />
    </Suspense>
  );
}
