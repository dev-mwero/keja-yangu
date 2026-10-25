import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInviteEmail } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { User } from "@/models/User";

const custodianInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  // Only meaningful for system-admin invites (bind to a specific owner).
  ownerId: z.string().trim().optional(),
});

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "owner" && user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = request.nextUrl.searchParams.get("ownerId");
  const filter: Record<string, unknown> = { role: "custodian" };

  if (user.role === "system-admin") {
    if (ownerId) filter.managedByOwnerId = ownerId;
  } else {
    if (ownerId && ownerId !== String(user._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.managedByOwnerId = String(user._id);
  }

  const custodians = await User.find(filter)
    .select("name email phone managedByOwnerId")
    .sort({ name: 1 })
    .lean();

  const data = custodians.map((c) => ({
    id: String(c._id),
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
    managedByOwnerId: c.managedByOwnerId ?? "",
  }));

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const actor = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!actor?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "owner" && actor.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = custodianInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid custodian payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const callerId = String(actor._id);
  const boundOwnerId = actor.role === "system-admin" ? (parsed.data.ownerId ?? "") : callerId;
  if (!boundOwnerId) {
    return NextResponse.json(
      { error: "ownerId is required when inviting a custodian as system-admin" },
      { status: 400 },
    );
  }
  if (actor.role === "system-admin") {
    const owner = await User.findOne({ _id: boundOwnerId, role: "owner", isActive: true })
      .select("_id")
      .lean();
    if (!owner) {
      return NextResponse.json(
        { error: "ownerId must reference an active owner" },
        { status: 400 },
      );
    }
  }

  const email = parsed.data.email;
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    if (existing.role !== "custodian") {
      return NextResponse.json(
        { error: "Email is already registered to a non-custodian account" },
        { status: 409 },
      );
    }
    if (existing.isActive) {
      const boundOwner = existing.managedByOwnerId ?? "";
      if (boundOwner !== "" && boundOwner !== boundOwnerId) {
        return NextResponse.json({ error: "Custodian is bound to another owner" }, { status: 409 });
      }
    }
    existing.managedByOwnerId = boundOwnerId;
    existing.isActive = true;
    if (parsed.data.name && existing.name !== parsed.data.name) existing.name = parsed.data.name;
    if (parsed.data.phone && existing.phone !== parsed.data.phone)
      existing.phone = parsed.data.phone;
    await existing.save();
    return NextResponse.json({
      linked: true,
      data: {
        id: String(existing._id),
        name: existing.name,
        email: existing.email,
        phone: existing.phone ?? "",
        managedByOwnerId: existing.managedByOwnerId,
      },
    });
  }

  const randomPassword = crypto.randomBytes(24).toString("base64url").slice(0, 32);
  const passwordHash = await bcrypt.hash(randomPassword, 12);
  const verificationToken = crypto.randomUUID();
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const created = await User.create({
    email,
    name: parsed.data.name ?? email,
    phone: parsed.data.phone ?? "",
    passwordHash,
    role: "custodian",
    managedByOwnerId: boundOwnerId,
    isActive: false,
    isVerified: false,
    verificationToken,
    verificationTokenExpiry,
  });

  await sendInviteEmail(email, created.name, "custodian", verificationToken);

  return NextResponse.json(
    {
      invited: true,
      data: {
        id: String(created._id),
        name: created.name,
        email: created.email,
        phone: created.phone ?? "",
        managedByOwnerId: created.managedByOwnerId,
      },
    },
    { status: 201 },
  );
}
