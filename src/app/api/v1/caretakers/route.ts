import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInviteEmail } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, CARETAKER_PRIVILEGES } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { createPhoneOnlyAccount, resolveUserByContact } from "@/lib/user-identity";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

const caretakerInviteSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().optional(),
    name: z.string().trim().min(1).optional(),
    phone: z.string().optional(),
    privileges: z.array(z.enum(CARETAKER_PRIVILEGES)).optional(),
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
  if (user.role === "caretaker" || user.role === "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = request.nextUrl.searchParams.get("ownerId");
  const filter: Record<string, unknown> = { role: "caretaker" };

  if (user.role === "system-admin") {
    if (ownerId) filter.managedByOwnerId = ownerId;
  } else if (user.role === "custodian") {
    const managedByOwnerId = user.managedByOwnerId ?? "";
    if (ownerId && ownerId !== managedByOwnerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.managedByOwnerId = managedByOwnerId;
  } else {
    if (ownerId && ownerId !== String(user._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.managedByOwnerId = String(user._id);
  }

  const caretakers = await User.find(filter)
    .select("name email phone managedByOwnerId privileges")
    .sort({ name: 1 })
    .lean();

  const ids = caretakers.map((c) => String(c._id));
  let counts: Array<{ _id: string; count: number }> = [];
  if (ids.length > 0) {
    counts = await Property.aggregate<{ _id: string; count: number }>([
      { $unwind: "$caretakerIds" },
      { $match: { caretakerIds: { $in: ids } } },
      { $group: { _id: "$caretakerIds", count: { $sum: 1 } } },
    ]);
  }

  const countByCaretaker = new Map(counts.map((c) => [String(c._id), c.count]));
  const data = caretakers.map((c) => ({
    id: String(c._id),
    name: c.name,
    email: c.email,
    phone: c.phone ?? "",
    managedByOwnerId: c.managedByOwnerId ?? "",
    privileges: c.privileges ?? [],
    propertyCount: countByCaretaker.get(String(c._id)) ?? 0,
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
  if (actor.role !== "owner" && actor.role !== "custodian" && actor.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = caretakerInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid caretaker payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let boundOwnerId = "";
  if (actor.role === "owner") {
    boundOwnerId = String(actor._id);
  } else if (actor.role === "custodian") {
    boundOwnerId = actor.managedByOwnerId ?? "";
    if (!boundOwnerId) {
      return NextResponse.json({ error: "Custodian is not assigned to an owner" }, { status: 403 });
    }
  } else {
    boundOwnerId = parsed.data.ownerId ?? "";
    if (!boundOwnerId) {
      return NextResponse.json(
        { error: "ownerId is required when inviting a caretaker as system-admin" },
        { status: 400 },
      );
    }
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
  const privileges = [...new Set(parsed.data.privileges ?? [])];
  const displayName = parsed.data.name ?? existing?.name ?? email ?? phone;

  if (existing) {
    if (existing.role !== "caretaker") {
      return NextResponse.json(
        { error: "Contact is already registered to a non-caretaker account" },
        { status: 409 },
      );
    }
    const boundOwner = existing.managedByOwnerId ?? "";
    if (boundOwner !== "" && boundOwner !== boundOwnerId) {
      return NextResponse.json({ error: "Caretaker is bound to another owner" }, { status: 409 });
    }

    const active = existing.isActive !== false && existing.isVerified !== false;
    if (!active && !email) {
      return NextResponse.json(
        { error: "This phone belongs to an inactive account" },
        { status: 409 },
      );
    }

    if (active) {
      const update = {
        managedByOwnerId: boundOwnerId,
        privileges,
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
          privileges,
        },
      });
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
          privileges,
          verificationToken,
          verificationTokenExpiry,
        },
      },
    );
    await sendInviteEmail(email, displayName, "caretaker", verificationToken);

    return NextResponse.json(
      {
        invited: true,
        data: {
          id: String(existing._id),
          name: displayName,
          email,
          phone,
          managedByOwnerId: boundOwnerId,
          privileges,
        },
      },
      { status: 201 },
    );
  }

  if (!email) {
    const { user: created, password } = await createPhoneOnlyAccount({
      role: "caretaker",
      name: displayName,
      phone,
      managedByOwnerId: boundOwnerId,
      privileges,
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
          privileges: created.privileges,
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
    role: "caretaker",
    privileges,
    managedByOwnerId: boundOwnerId,
    isActive: false,
    isVerified: false,
    verificationToken,
    verificationTokenExpiry,
  });

  await sendInviteEmail(email, created.name, "caretaker", verificationToken);

  return NextResponse.json(
    {
      invited: true,
      data: {
        id: String(created._id),
        name: created.name,
        email: created.email,
        phone: created.phone ?? "",
        managedByOwnerId: created.managedByOwnerId,
        privileges: created.privileges,
      },
    },
    { status: 201 },
  );
}
