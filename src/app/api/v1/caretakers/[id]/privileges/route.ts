import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate, CARETAKER_PRIVILEGES, type CaretakerPrivilege } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { User } from "@/models/User";

const privilegeInput = z.object({
  privileges: z.array(z.enum(CARETAKER_PRIVILEGES)),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid caretaker id" }, { status: 400 });
  }

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
  const parsed = privilegeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid privileges payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await User.findById(id).select("role managedByOwnerId").lean();
  if (target?.role !== "caretaker") {
    return NextResponse.json({ error: "Target user is not a caretaker" }, { status: 400 });
  }

  const privileges: CaretakerPrivilege[] = [...new Set(parsed.data.privileges)];
  const update: { privileges: CaretakerPrivilege[]; managedByOwnerId?: string } = { privileges };

  if (actor.role === "owner") {
    const ownerId = String(actor._id);
    const boundOwnerId = target.managedByOwnerId ?? "";
    if (boundOwnerId !== "" && boundOwnerId !== ownerId) {
      return NextResponse.json({ error: "Caretaker is bound to another owner" }, { status: 409 });
    }
    update.managedByOwnerId = ownerId;
  }

  const updated = await User.findOneAndUpdate({ _id: id }, update, {
    new: true,
    runValidators: true,
  })
    .select("name email managedByOwnerId privileges")
    .lean();
  if (!updated) {
    return NextResponse.json({ error: "Caretaker not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      id: String(updated._id),
      name: updated.name,
      email: updated.email,
      managedByOwnerId: updated.managedByOwnerId ?? "",
      privileges: updated.privileges ?? [],
    },
  });
}
