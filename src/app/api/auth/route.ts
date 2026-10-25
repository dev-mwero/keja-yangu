import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { z } from "zod";
import { encryptField } from "@/lib/crypto";
import { isEmailConfigured, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { getJwtSecret } from "@/lib/jwt";
import { connectToDatabase } from "@/lib/mongoose";
import { isValidE164, isValidNationalId, normalizeNationalId } from "@/lib/phone";
import { isProfileComplete } from "@/lib/profile-completion";
import { rateLimitAuth } from "@/lib/rate-limit-auth";
import { type Role, roleRoute } from "@/lib/role-routes";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

const signInSchema = z.object({
  identifier: z.string().min(1, "Email or phone required").optional(),
  email: z.string().email("Enter a valid email").optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
}).refine((data) => data.identifier || data.email, "Email or phone required");

const signUpSchema = z.object({
  name: z.string().min(2, "Tell us your name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(["tenant", "caretaker", "owner"]),
  phone: z
    .string()
    .trim()
    .refine((value) => isValidE164(value), "Enter a valid mobile number with its country code"),
  nationalId: z
    .string()
    .trim()
    .refine(
      (value) => isValidNationalId(normalizeNationalId(value)),
      "Enter a valid national ID number",
    ),
});

const signUpWithVerificationSchema = signUpSchema.extend({
  name: z.string().min(2),
});

/**
 * Per-action throttle. Credential and email-sending actions get the tightest
 * budgets; verify/reset (token-gated) are looser. Buckets are per IP *and*
 * action, so hammering one endpoint cannot exhaust another's allowance.
 */
const AUTH_RATE_LIMITS: Record<string, { windowMs: number; limit: number }> = {
  signin: { windowMs: 15 * 60_000, limit: 10 },
  signup: { windowMs: 15 * 60_000, limit: 5 },
  "resend-verification": { windowMs: 15 * 60_000, limit: 3 },
  "forgot-password": { windowMs: 15 * 60_000, limit: 3 },
  "reset-password": { windowMs: 15 * 60_000, limit: 10 },
  "verify-email": { windowMs: 15 * 60_000, limit: 10 },
};
const DEFAULT_AUTH_RATE_LIMIT = { windowMs: 15 * 60_000, limit: 20 };

async function generateVerificationToken(): Promise<string> {
  return crypto.randomUUID();
}

function issueSession(
  response: NextResponse,
  user: { _id?: unknown; id?: string; email: string; role: string; name?: string },
): NextResponse {
  const userId = user._id ? String(user._id) : (user.id ?? "");
  const token = jwt.sign(
    { userId, email: user.email, role: user.role, name: user.name },
    getJwtSecret(),
    { expiresIn: "7d" },
  );

  response.cookies.set("keja-token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    const limitConfig = AUTH_RATE_LIMITS[action as string] ?? DEFAULT_AUTH_RATE_LIMIT;
    const rateLimited = await rateLimitAuth(request, {
      ...limitConfig,
      key: typeof action === "string" ? action : "default",
    });
    if (rateLimited) return rateLimited;

    if (action === "signin") {
      const parsed = signInSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }

      await connectToDatabase();
      const rawId = (parsed.data.identifier ?? parsed.data.email ?? "").trim();
      const emailLookup = rawId.toLowerCase();
      // Emails are stored lowercased, so normalise before lookup.
      let user = await User.findOne({ email: emailLookup }).lean();
      // Fall back to phone lookup when no email match (plain E.164, indexed).
      if (!user && /^\+?[\d\s\-]+$/.test(rawId)) {
        user = await User.findOne({ phone: rawId }).lean();
      }
      // biome-ignore lint/complexity: useOptionalChain
      if (!user || !user.isActive) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }
      if (!user.isVerified) {
        return NextResponse.json({ error: "Please verify your email first" }, { status: 403 });
      }

      const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      // Bind tenant signups to any unbound Tenant rows carrying the same
      // email (normalised to match signup storage). This heals tenancies
      // created before the verify-email bind existed or where verification
      // ran before the Tenant row was added. Phone-only accounts bind by
      // phone instead.
      if (user.role === "tenant") {
        const userId = user._id?.toString() ?? user.id ?? "";
        if (user.email) {
          await Tenant.updateMany(
            { email: user.email.trim().toLowerCase(), userId: "" },
            { $set: { userId } },
          );
        } else if (user.phone) {
          await Tenant.updateMany(
            { phone: user.phone, userId: "" },
            { $set: { userId } },
          );
        }
      }

      const response = NextResponse.json({
        user: {
          email: user.email,
          phone: user.phone,
          name: user.name,
          role: user.role,
        },
      });
      return issueSession(response, user);
    }

    if (action === "signup") {
      const parsed = signUpWithVerificationSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }

      await connectToDatabase();
      const email = parsed.data.email.trim().toLowerCase();
      const existing = await User.findOne({ email });
      if (existing) {
        // Adopt a pre-created, not-yet-onboarded caretaker/tenant account
        // (created via the invite flow) instead of duplicating it.
        const adoptable =
          !existing.isActive &&
          !existing.isVerified &&
          existing.managedByOwnerId &&
          (existing.role === "caretaker" ||
            existing.role === "tenant" ||
            existing.role === "custodian");
        if (adoptable) {
          const passwordHash = await bcrypt.hash(parsed.data.password, 12);
          const verificationToken = await generateVerificationToken();
          const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

          existing.name = parsed.data.name;
          existing.passwordHash = passwordHash;
          existing.isActive = true;
          existing.isVerified = false;
          existing.phone = parsed.data.phone;
          existing.nationalId = encryptField(normalizeNationalId(parsed.data.nationalId));
          existing.verificationToken = verificationToken;
          existing.verificationTokenExpiry = verificationTokenExpiry;
          await existing.save();

          const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          const verifyUrl = `${appBaseUrl}/auth/verify?token=${verificationToken}`;

          const emailSent = isEmailConfigured()
            ? await sendVerificationEmail(email, verificationToken, parsed.data.name)
            : false;

          if (!emailSent) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                `[DEV] Email sending failed. Verification link for ${email}: ${verifyUrl}`,
              );
            }
            return NextResponse.json(
              { error: "Failed to send verification email. Please try again later." },
              { status: 500 },
            );
          }

          return NextResponse.json({
            message:
              "Account created successfully! Please check your inbox (and spam folder) for the verification email to activate your account.",
          });
        }
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const verificationToken = await generateVerificationToken();
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const createdUser = await User.create({
        email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        phone: parsed.data.phone,
        nationalId: encryptField(normalizeNationalId(parsed.data.nationalId)),
        verificationToken,
        verificationTokenExpiry,
      });

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const verifyUrl = `${appBaseUrl}/auth/verify?token=${verificationToken}`;

      const emailSent = isEmailConfigured()
        ? await sendVerificationEmail(email, verificationToken, parsed.data.name)
        : false;

      if (!emailSent) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[DEV] Email sending failed. Verification link for ${email}: ${verifyUrl}`);
        }
        await User.deleteOne({ _id: createdUser._id });
        return NextResponse.json(
          { error: "Failed to send verification email. Please try again later." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        message:
          "Account created successfully! Please check your inbox (and spam folder) for the verification email to activate your account.",
      });
    }

    if (action === "verify-email") {
      const { token } = body;
      if (!token) {
        return NextResponse.json({ error: "Verification token required" }, { status: 400 });
      }

      await connectToDatabase();
      const user = await User.findOne({
        verificationToken: token,
        verificationTokenExpiry: { $gt: new Date() },
      });
      if (!user) {
        return NextResponse.json(
          { error: "Invalid or expired verification token" },
          { status: 400 },
        );
      }

      // Activate pending invited accounts (created inactive)
      const isPendingInvite = !user.isActive || Boolean(user.managedByOwnerId);
      if (isPendingInvite) {
        user.isActive = true;
      }

      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpiry = undefined;
      await user.save();

      // Bind tenant signups to any unbound Tenant rows carrying the same
      // verified email (lowercased to match signup normalization).
      if (user.role === "tenant") {
        const userId = user._id?.toString() ?? user.id ?? "";
        await Tenant.updateMany(
          { email: user.email.trim().toLowerCase(), userId: "" },
          { $set: { userId } },
        );
      }

      const role = user.role as Role;
      const baseDashboard = roleRoute[role] ?? "/dashboard";
      const complete = isProfileComplete(user);
      const redirectTo = complete
        ? baseDashboard
        : `${baseDashboard}/settings?next=${encodeURIComponent(baseDashboard)}`;

      const response = NextResponse.json({
        message: "Email verified successfully",
        user: { email: user.email, name: user.name, role: user.role },
        redirectTo,
      });

      return issueSession(response, user);
    }

    if (action === "resend-verification") {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ error: "Email required" }, { status: 400 });
      }
      const normalizedEmail = String(email).trim().toLowerCase();

      await connectToDatabase();
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      if (user.isVerified) {
        return NextResponse.json({ error: "Email already verified" }, { status: 400 });
      }

      const verificationToken = await generateVerificationToken();
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      user.verificationToken = verificationToken;
      user.verificationTokenExpiry = verificationTokenExpiry;
      await user.save();

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const verifyUrl = `${appBaseUrl}/auth/verify?token=${verificationToken}`;

      const emailSent = isEmailConfigured()
        ? await sendVerificationEmail(normalizedEmail, verificationToken, user.name || "User")
        : false;

      if (!emailSent) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[DEV] Email sending failed. Verification link for ${normalizedEmail}: ${verifyUrl}`,
          );
        }
        return NextResponse.json(
          { error: "Failed to send verification email. Please try again later." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        message: "Verification email resent. Please check your inbox (and spam folder).",
      });
    }

    if (action === "forgot-password") {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ error: "Email required" }, { status: 400 });
      }
      const normalizedEmail = String(email).trim().toLowerCase();

      await connectToDatabase();
      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        // Don't reveal if user exists
        return NextResponse.json({
          message: "If the email exists, a password reset link has been sent.",
        });
      }

      const resetToken = await generateVerificationToken();
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      user.verificationToken = resetToken;
      user.verificationTokenExpiry = resetTokenExpiry;
      await user.save();

      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`;
      const emailSent = isEmailConfigured()
        ? await sendPasswordResetEmail(user.email, resetToken, user.name || "User")
        : false;

      if (!emailSent) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `[DEV] Password reset email failed. Reset link for ${normalizedEmail}: ${resetUrl}`,
          );
        }
        return NextResponse.json(
          { error: "Failed to send password reset email. Please try again later." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        message: "If the email exists, a password reset link has been sent.",
      });
    }

    if (action === "reset-password") {
      const { token, password } = body;
      if (!token || !password) {
        return NextResponse.json({ error: "Token and new password required" }, { status: 400 });
      }
      if (password.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 },
        );
      }

      await connectToDatabase();
      const user = await User.findOne({
        verificationToken: token,
        verificationTokenExpiry: { $gt: new Date() },
      });
      if (!user) {
        return NextResponse.json({ error: "Invalid or expired reset token" }, { status: 400 });
      }

      user.passwordHash = await bcrypt.hash(password, 12);
      user.verificationToken = undefined;
      user.verificationTokenExpiry = undefined;
      await user.save();

      return NextResponse.json({ message: "Password reset successfully. You can now sign in." });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (_error) {
    console.error("Auth error:", _error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
