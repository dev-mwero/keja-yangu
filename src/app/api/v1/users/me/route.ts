import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/app/api/v1/_helpers";
import { decryptField, encryptField } from "@/lib/crypto";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { normalizeNationalId } from "@/lib/phone";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { profileUpdate } from "@/lib/schemas";
import { User } from "@/models/User";

const PROFILE_FIELDS = "name email role phone whatsapp nationalId";

interface ProfileDoc {
  _id: unknown;
  name?: string;
  email?: string;
  role?: string;
  phone?: string;
  whatsapp?: string;
  nationalId?: string;
}

function serialize(user: ProfileDoc) {
  return {
    id: String(user._id),
    name: user.name ?? "",
    email: user.email ?? "",
    role: user.role ?? "",
    phone: user.phone ?? "",
    whatsapp: user.whatsapp ?? "",
    nationalId: decryptField(user.nationalId ?? ""),
  };
}

/** The authenticated user's own contact + identity details. */
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "settings:read");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = (await User.findById(auth.userId)
    .select(PROFILE_FIELDS)
    .lean()) as ProfileDoc | null;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ data: serialize(user) });
}

/** Updates the authenticated user's own contact + identity details. */
export async function PATCH(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "settings:write");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(request);
  const parsed = profileUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const set: Record<string, string> = {};
  if (parsed.data.name !== undefined) set.name = parsed.data.name;
  if (parsed.data.phone !== undefined) set.phone = parsed.data.phone;
  if (parsed.data.whatsapp !== undefined) set.whatsapp = parsed.data.whatsapp;
  if (parsed.data.nationalId !== undefined) {
    set.nationalId = encryptField(normalizeNationalId(parsed.data.nationalId));
  }

  if (Object.keys(set).length > 0) {
    await User.updateOne({ _id: auth.userId }, { $set: set });
  }

  const user = (await User.findById(auth.userId)
    .select(PROFILE_FIELDS)
    .lean()) as ProfileDoc | null;
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ data: serialize(user) });
}
