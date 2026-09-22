import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isEmailConfigured, sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";

const signInSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role: z.enum(["tenant", "caretaker", "owner"]),
});

const signUpWithVerificationSchema = signUpSchema.extend({
  name: z.string().min(2),
});

async function generateVerificationToken(): Promise<string> {
  return crypto.randomUUID();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "signin") {
      const parsed = signInSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 },
        );
      }

      await connectToDatabase();
      const user = await User.findOne({ email: parsed.data.email }).lean();
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

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET ?? "fallback-secret",
        { expiresIn: "7d" },
      );

      const response = NextResponse.json({
        user: { email: user.email, name: user.name, role: user.role },
      });
      response.cookies.set("keja-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return response;
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
      const existing = await User.findOne({ email: parsed.data.email });
      if (existing) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const verificationToken = await generateVerificationToken();
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const createdUser = await User.create({
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        verificationToken,
        verificationTokenExpiry,
      });

      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const verifyUrl = `${appBaseUrl}/auth/verify?token=${verificationToken}`;

      const emailSent = isEmailConfigured()
        ? await sendVerificationEmail(parsed.data.email, verificationToken, parsed.data.name)
        : false;

      if (!emailSent) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[DEV] Email sending failed. Verification link for ${parsed.data.email}: ${verifyUrl}`);
        }
        await User.deleteOne({ _id: createdUser._id });
        return NextResponse.json(
          { error: "Failed to send verification email. Please try again later." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        message: "Account created successfully! Please check your inbox (and spam folder) for the verification email to activate your account.",
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

      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationTokenExpiry = undefined;
      await user.save();

      return NextResponse.json({ message: "Email verified successfully" });
    }

    if (action === "resend-verification") {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ error: "Email required" }, { status: 400 });
      }

      await connectToDatabase();
      const user = await User.findOne({ email });
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

      const emailSent = isEmailConfigured() ? await sendVerificationEmail(email, verificationToken, user.name || "User") : false;

      if (!emailSent) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[DEV] Email sending failed. Verification link for ${email}: ${verifyUrl}`);
        }
        return NextResponse.json(
          { error: "Failed to send verification email. Please try again later." },
          { status: 500 },
        );
      }

      return NextResponse.json({ message: "Verification email resent. Please check your inbox (and spam folder)." });
    }

    if (action === "forgot-password") {
      const { email } = body;
      if (!email) {
        return NextResponse.json({ error: "Email required" }, { status: 400 });
      }

      await connectToDatabase();
      const user = await User.findOne({ email });
      if (!user) {
        // Don't reveal if user exists
        return NextResponse.json({ message: "If the email exists, a password reset link has been sent." });
      }

      const resetToken = await generateVerificationToken();
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      user.verificationToken = resetToken;
      user.verificationTokenExpiry = resetTokenExpiry;
      await user.save();

      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`;
      const emailSent = isEmailConfigured() ? await sendPasswordResetEmail(user.email, resetToken, user.name || "User") : false;

      if (!emailSent) {
        if (process.env.NODE_ENV === "development") {
          console.warn(`[DEV] Password reset email failed. Reset link for ${email}: ${resetUrl}`);
        }
        return NextResponse.json(
          { error: "Failed to send password reset email. Please try again later." },
          { status: 500 },
        );
      }

      return NextResponse.json({ message: "If the email exists, a password reset link has been sent." });
    }

    if (action === "reset-password") {
      const { token, password } = body;
      if (!token || !password) {
        return NextResponse.json({ error: "Token and new password required" }, { status: 400 });
      }
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
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
