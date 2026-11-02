import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/app/api/v1/_helpers";
import { AssignmentError, revokeAssignment } from "@/lib/assignments";
import { authenticate } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";

const revokeInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid assignment id" }, { status: 400 });
  }

  const parsed = revokeInput.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A revocation reason is required", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      data: await revokeAssignment(auth.userId, id, parsed.data.reason),
    });
  } catch (error) {
    if (error instanceof AssignmentError) {
      const status = {
        unauthorized: 401,
        forbidden: 403,
        invalid: 400,
        "not-found": 404,
        conflict: 409,
      }[error.code];
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
