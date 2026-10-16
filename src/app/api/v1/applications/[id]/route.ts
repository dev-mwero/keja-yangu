import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { asSoftDeleteModel } from "@/lib/mongoose-soft-delete";
import { authenticate, requirePermission } from "@/lib/permissions";
import { applicationDecisionInput } from "@/lib/schemas/application";
import { Application } from "@/models/Application";
import { User } from "@/models/User";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  await connectToDatabase();
  const application = await Application.findById(id);
  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const authError = await requirePermission(request, "application:manage", {
    resource: { ownerId: application.ownerId },
  });
  if (authError) return authError;

  const body = await request.json();
  const parsed = applicationDecisionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid decision payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const actor = authenticate(request);
  application.status = parsed.data.status;
  application.decisionNote = parsed.data.decisionNote ?? "";
  application.decidedById = actor?.userId ?? "";
  application.decidedAt = new Date();
  await application.save();

  return NextResponse.json({ data: application.toObject() });
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const auth = authenticate(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive").lean();
  if (!user?.isActive) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const application = await Application.findById(id).select("applicantUserId status").lean();
  if (!application) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (user.role !== "tenant" || application.applicantUserId !== auth.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (application.status !== "pending") {
    return NextResponse.json(
      { error: "Only a pending application can be withdrawn" },
      { status: 400 },
    );
  }

  await asSoftDeleteModel(Application).softDeleteById(id);
  return NextResponse.json({ data: { _id: id } });
}
