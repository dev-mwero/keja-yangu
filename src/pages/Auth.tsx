import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { roleRoute, isRouteAllowedForRole } from "@/config/roleRoutes";
import hero from "@/assets/hero-building.jpg";

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

const RETURN_TO_KEY = "keja-return-to";

const consumeReturnTo = (stateFrom?: string): string | null => {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    /* ignore */
  }
  return stateFrom ?? stored;
};

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { signIn: signInUser } = useAuth();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [submitting, setSubmitting] = useState(false);

  const signIn = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUp = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "", role: "tenant" },
  });

  const onSignIn = (values: SignInValues) => {
    setSubmitting(true);
    setTimeout(() => {
      const role = values.email.startsWith("owner")
        ? "owner"
        : values.email.startsWith("care")
        ? "caretaker"
        : "tenant";
      signInUser({ email: values.email, role });
      toast({ title: "Welcome back", description: `Signed in as ${role}.` });
      setSubmitting(false);
      // Redirect to intended destination if it matches user's role, otherwise to default dashboard
      const from = consumeReturnTo((location.state as { from?: string } | null)?.from);
      navigate(from && isRouteAllowedForRole(from, role) ? from : roleRoute[role]);
    }, 600);
  };

  const onSignUp = (values: SignUpValues) => {
    setSubmitting(true);
    setTimeout(() => {
      signInUser({ email: values.email, name: values.name, role: values.role });
      toast({ title: "Account created", description: `Welcome to Keja, ${values.name}.` });
      setSubmitting(false);
      const from = consumeReturnTo((location.state as { from?: string } | null)?.from);
      navigate(from && isRouteAllowedForRole(from, values.role) ? from : roleRoute[values.role]);
    }, 700);
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      {/* Left — visual */}
      <div className="relative hidden overflow-hidden lg:block">
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/80 via-secondary/40 to-transparent" />
        <div className="relative flex h-full flex-col justify-between p-10 text-secondary-foreground">
          <Logo className="text-secondary-foreground" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="max-w-md"
          >
            <p className="text-xs font-medium uppercase tracking-widest text-primary-glow">
              The new way to rent
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
              Where home <span className="italic text-primary-glow">begins</span>.
            </h2>
            <p className="mt-4 text-sm text-secondary-foreground/70">
              Sign in to track applications, manage units, or oversee your portfolio —
              all in one calm, modern space.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right — form */}
      <div className="relative flex min-h-screen flex-col px-6 py-8 lg:px-12">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back home
          </Link>
          <Logo className="lg:hidden" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12"
        >
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            {tab === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tab === "signin"
              ? "Sign in to continue to Keja."
              : "Join as a tenant, caretaker, or owner."}
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")} className="mt-8">
            <TabsList className="grid w-full grid-cols-2 rounded-full bg-muted p-1">
              <TabsTrigger value="signin" className="rounded-full">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={signIn.handleSubmit(onSignIn)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="si-email">Email</Label>
                  <Input id="si-email" type="email" placeholder="you@keja.co" {...signIn.register("email")} />
                  {signIn.formState.errors.email && (
                    <p className="text-xs text-destructive">{signIn.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="si-pw">Password</Label>
                  <Input id="si-pw" type="password" placeholder="••••••••" {...signIn.register("password")} />
                  {signIn.formState.errors.password && (
                    <p className="text-xs text-destructive">{signIn.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full rounded-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Tip: prefix email with <code>owner</code>, <code>care</code>, or anything else to land on that dashboard.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={signUp.handleSubmit(onSignUp)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="su-name">Full name</Label>
                  <Input id="su-name" placeholder="Amina Otieno" {...signUp.register("name")} />
                  {signUp.formState.errors.name && (
                    <p className="text-xs text-destructive">{signUp.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-email">Email</Label>
                  <Input id="su-email" type="email" placeholder="you@keja.co" {...signUp.register("email")} />
                  {signUp.formState.errors.email && (
                    <p className="text-xs text-destructive">{signUp.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="su-pw">Password</Label>
                  <Input id="su-pw" type="password" placeholder="At least 6 characters" {...signUp.register("password")} />
                  {signUp.formState.errors.password && (
                    <p className="text-xs text-destructive">{signUp.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>I am a</Label>
                  <RadioGroup
                    value={signUp.watch("role")}
                    onValueChange={(v) => signUp.setValue("role", v as SignUpValues["role"])}
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
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  By continuing, you agree to Keja's terms and privacy policy.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </motion.div>

        <p className="text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Keja</p>
      </div>
    </div>
  );
};

export default Auth;