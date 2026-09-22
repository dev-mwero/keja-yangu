import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendVerificationEmail } from "@/lib/email";
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

      { await User.create({
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
        verificationToken,
        verificationTokenExpiry,
      });

      await sendVerificationEmail(parsed.data.email, verificationToken);

      return NextResponse.json({
        message: "Account created. Please verify your email to continue.",
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

      await sendVerificationEmail(email, verificationToken);
      return NextResponse.json({ message: "Verification email resent" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (_error) {
    console.error("Auth error:", _error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
