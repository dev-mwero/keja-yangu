import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInviteEmail } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { createPhoneOnlyAccount, resolveUserByContact } from "@/lib/user-identity";
import { User } from "@/models/User";

const custodianInviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().optional(),
    // Only meaningful for system-admin invites (bind to a specific owner).
    ownerId: z.string().trim().optional(),
  })
  .refine((data) => data.email || data.phone, "Email or phone is required");

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
    .select("name email phone managedByOwnerId privileges")
    .sort({ name: 1 })
    .lean();

  const data = custodians.map((c) => ({
    id: String(c._id),
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
    managedByOwnerId: c.managedByOwnerId ?? "",
    privileges: c.privileges ?? [],
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

  const identity = await resolveUserByContact({
    email: parsed.data.email,
    phone: parsed.data.phone,
  });
  if (!identity.ok) {
    return NextResponse.json(
      { error: identity.message },
      { status: identity.kind === "identity-conflict" ? 409 : 400 },
    );
  }

  const { email, phone, user: existing } = identity;
  const displayName = parsed.data.name ?? existing?.name ?? email ?? phone;

  if (existing) {
    if (existing.role !== "custodian") {
      return NextResponse.json(
        { error: "Contact is already registered to a non-custodian account" },
        { status: 409 },
      );
    }

    const active = existing.isActive !== false && existing.isVerified !== false;
    if (active) {
      const boundOwner = existing.managedByOwnerId ?? "";
      if (boundOwner !== "" && boundOwner !== boundOwnerId) {
        return NextResponse.json({ error: "Custodian is bound to another owner" }, { status: 409 });
      }
      const update = {
        managedByOwnerId: boundOwnerId,
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(phone && existing.phone !== phone ? { phone } : {}),
      };
      await User.updateOne({ _id: existing._id }, { $set: update });
      return NextResponse.json({
        linked: true,
        data: {
          id: String(existing._id),
          name: update.name ?? existing.name,
          email: existing.email ?? email,
          phone: update.phone ?? existing.phone ?? phone,
          managedByOwnerId: boundOwnerId,
          privileges: existing.privileges ?? [],
        },
      });
    }

    if (!email) {
      return NextResponse.json(
        { error: "This phone belongs to an inactive account" },
        { status: 409 },
      );
    }

    const verificationToken = crypto.randomUUID();
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await User.updateOne(
      { _id: existing._id },
      {
        $set: {
          email,
          name: displayName,
          phone,
          managedByOwnerId: boundOwnerId,
          verificationToken,
          verificationTokenExpiry,
        },
      },
    );
    await sendInviteEmail(email, displayName, "custodian", verificationToken);

    return NextResponse.json(
      {
        invited: true,
        data: {
          id: String(existing._id),
          name: displayName,
          email,
          phone,
          managedByOwnerId: boundOwnerId,
          privileges: existing.privileges ?? [],
        },
      },
      { status: 201 },
    );
  }

  // Phone-only path: create an active, verified custodian that signs in with
  // phone + password. Credentials are returned so the admin can share them
  // out-of-band (no SMS/WhatsApp yet).
  if (!email) {
    const { user: created, password } = await createPhoneOnlyAccount({
      role: "custodian",
      name: displayName,
      phone,
      managedByOwnerId: boundOwnerId,
    });

    return NextResponse.json(
      {
        created: true,
        password,
        data: {
          id: String(created._id),
          name: created.name,
          email: created.email,
          phone: created.phone,
          managedByOwnerId: created.managedByOwnerId,
          privileges: created.privileges ?? [],
        },
      },
      { status: 201 },
    );
  }

  const randomPassword = crypto.randomBytes(24).toString("base64url").slice(0, 32);
  const passwordHash = await bcrypt.hash(randomPassword, 12);
  const verificationToken = crypto.randomUUID();
  const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const created = await User.create({
    email,
    name: displayName,
    phone,
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
        privileges: created.privileges ?? [],
      },
    },
    { status: 201 },
  );
}
