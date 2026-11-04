import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isDuplicateKeyError } from "@/app/api/v1/_helpers";
import { AssignmentError, acceptAssignment } from "@/lib/assignments";
import { authenticate } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";

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

  try {
    return NextResponse.json({ data: await acceptAssignment(auth.userId, id) });
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
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "An active assignment already covers that scope" },
        { status: 409 },
      );
    }
    throw error;
  }
}
