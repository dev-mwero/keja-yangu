import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendInviteEmail } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, CARETAKER_PRIVILEGES } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

const caretakerInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).optional(),
  phone: z.string().optional(),
  privileges: z.array(z.enum(CARETAKER_PRIVILEGES)).optional(),
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
  if (user.role === "caretaker" || user.role === "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = request.nextUrl.searchParams.get("ownerId");
  const filter: Record<string, unknown> = { role: "caretaker" };

  if (user.role === "system-admin") {
    if (ownerId) filter.managedByOwnerId = ownerId;
  } else {
    if (ownerId && ownerId !== String(user._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.managedByOwnerId = String(user._id);
  }

  const caretakers = await User.find(filter)
    .select("name email managedByOwnerId privileges")
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
  if (actor.role !== "owner" && actor.role !== "system-admin") {
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

  const callerId = String(actor._id);
  const email = parsed.data.email;
  const privileges = [...new Set(parsed.data.privileges ?? [])];

  const existing = await User.findOne({ email }).lean();
  if (existing) {
    if (!existing.isActive) {
      return NextResponse.json({ error: "User is not active" }, { status: 409 });
    }
    const boundOwner = existing.managedByOwnerId ?? "";
    if (boundOwner !== "" && boundOwner !== callerId) {
      return NextResponse.json({ error: "Caretaker is bound to another owner" }, { status: 409 });
    }
    existing.managedByOwnerId = callerId;
    existing.privileges = privileges;
    if (parsed.data.name && existing.name !== parsed.data.name) {
      existing.name = parsed.data.name;
    }
    if (parsed.data.phone && existing.phone !== parsed.data.phone) {
      existing.phone = parsed.data.phone;
    }
    await existing.save();
    return NextResponse.json({
      linked: true,
      data: {
        id: String(existing._id),
        name: existing.name,
        email: existing.email,
        managedByOwnerId: existing.managedByOwnerId,
        privileges: existing.privileges,
      },
    });
  }

  const randomPassword = crypto.randomBytes(24).toString("base64url").slice(0, 32);
  const passwordHash = await bcrypt.hash(randomPassword, 12);

  const created = await User.create({
    email,
    name: parsed.data.name ?? email,
    phone: parsed.data.phone ?? "",
    passwordHash,
    role: "caretaker",
    privileges,
    managedByOwnerId: callerId,
    isActive: false,
    isVerified: false,
  });

  await sendInviteEmail(email, created.name, "caretaker");

  return NextResponse.json(
    {
      invited: true,
      data: {
        id: String(created._id),
        name: created.name,
        email: created.email,
        managedByOwnerId: created.managedByOwnerId,
        privileges: created.privileges,
      },
    },
    { status: 201 },
  );
}
