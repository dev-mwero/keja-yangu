import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { sendContactMessage } from "@/lib/email";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { contactInput } from "@/lib/schemas/contact";
import { ContactMessage } from "@/models/ContactMessage";

export async function GET(request: NextRequest) {
  const user = authenticate(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectToDatabase();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const filter = status === "new" || status === "read" ? { status } : {};
  const messages = await ContactMessage.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return NextResponse.json({ data: messages });
}

export async function POST(request: NextRequest) {
  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const limited = await rateLimit(request, { windowMs: 60_000, limit: 5, key: "contact" });
  if (limited instanceof NextResponse) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = contactInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const saved = await ContactMessage.create(parsed.data);

  // Email is best-effort: the message is already stored, so a delivery failure
  // must not make the submission look failed to the user.
  await sendContactMessage(parsed.data).catch(() => false);

  return NextResponse.json({ ok: true, id: String(saved._id) }, { status: 201 });
}
