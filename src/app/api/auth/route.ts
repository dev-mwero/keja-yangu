import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";
import bcrypt from "bcryptjs";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "signin") {
      const parsed = signInSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 }
        );
      }

      await connectToDatabase();
      const user = await User.findOne({ email: parsed.data.email }).lean();
      if (!user?.isActive) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET ?? "fallback-secret",
        { expiresIn: "7d" }
      );

      const response = NextResponse.json({ user: { email: user.email, name: user.name, role: user.role } });
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
      const parsed = signUpSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Invalid input", issues: parsed.error.flatten() },
          { status: 400 }
        );
      }

      await connectToDatabase();
      const existing = await User.findOne({ email: parsed.data.email });
      if (existing) {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const user = await User.create({
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: parsed.data.role,
      });

      const token = jwt.sign(
        { userId: user._id, email: user.email, role: user.role, name: user.name },
        process.env.JWT_SECRET ?? "fallback-secret",
        { expiresIn: "7d" }
      );

      const response = NextResponse.json({ user: { email: user.email, name: user.name, role: user.role } });
      response.cookies.set("keja-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
      return response;
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (_error) {
    console.error("Auth error:", _error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
