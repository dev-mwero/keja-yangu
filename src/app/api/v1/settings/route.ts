import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { readJsonBody } from "@/app/api/v1/_helpers";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { DEFAULT_SETTINGS, settingsUpdate } from "@/lib/schemas";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "settings:read");
  if (authError) return authError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const user = await User.findById(auth.userId).select("settings").lean();
  const settings = { ...DEFAULT_SETTINGS, ...(user?.settings ?? {}) };

  return NextResponse.json({ data: settings });
}

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
  const parsed = settingsUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid settings payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();

  // Dotted-path fields keep the subdocument an insertable/updatable unit.
  const set: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    set[`settings.${key}`] = value;
  }

  await User.updateOne({ _id: auth.userId }, { $set: set });

  const user = await User.findById(auth.userId).select("settings").lean();
  const settings = { ...DEFAULT_SETTINGS, ...(user?.settings ?? {}) };

  return NextResponse.json({ data: settings });
}
