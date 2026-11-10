import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { propertyTitleMap, readJsonBody, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { TASK_STATUSES } from "@/lib/domain-enums";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { taskInput } from "@/lib/schemas/task";
import { serializeTask } from "@/lib/tasks";
import { Task } from "@/models/Task";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;
  const status = request.nextUrl.searchParams.get("status");
  const propertyId = request.nextUrl.searchParams.get("propertyId");
  const assignedTo = request.nextUrl.searchParams.get("assignedTo");

  if (status && !(TASK_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Invalid task status" }, { status: 400 });
  }

  const authError = await requirePermission(request, "task:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request, "task:read-own");
  if (actor instanceof NextResponse) return actor;

  const filter: Record<string, unknown> = {};
  if (actor.role === "caretaker") {
    filter.ownerId = actor.managedByOwnerId;
    if (actor.assignedPropertyIds.length > 0) {
      filter.propertyId = { $in: actor.assignedPropertyIds };
    } else {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
  } else if (actor.role === "custodian") {
    filter.ownerId = actor.managedByOwnerId;
  } else if (actor.role === "admin" || actor.role === "system-admin") {
    if (actor.propertyScopeIds.length > 0) {
      filter.propertyId = { $in: actor.propertyScopeIds };
    }
  }
  if (status) filter.status = status;
  if (propertyId) filter.propertyId = propertyId;
  if (assignedTo) filter.assignedTo = assignedTo;

  const [tasks, total] = await Promise.all([
    Task.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Task.countDocuments(filter),
  ]);
  const titles = await propertyTitleMap(tasks.map((t) => t.propertyId));

  return NextResponse.json(
    buildPaginationResult(
      tasks.map((t) => serializeTask(t, titles)),
      total,
      page,
      limit,
    ),
  );
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "task:create");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = taskInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid task payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const actor = await resolveDashboardActor(request, "task:create");
  if (actor instanceof NextResponse) return actor;

  const ownerId = actor.managedByOwnerId ?? actor.userId;

  const creator = await User.findById(actor.userId).select("name").lean();

  const task = await Task.create({
    title: parsed.data.title,
    propertyId: parsed.data.propertyId ?? "",
    priority: parsed.data.priority,
    status: parsed.data.status,
    assignedTo: parsed.data.assignedTo ?? "",
    assignedToName: parsed.data.assignedToName ?? "",
    createdBy: actor.userId,
    createdByRole: actor.role,
    createdByName: (creator as { name?: string } | null)?.name ?? "",
    ownerId,
    dueDate: parsed.data.dueDate,
    notes: parsed.data.notes ?? "",
  });

  const titles = await propertyTitleMap([task.propertyId]);
  return NextResponse.json({ data: serializeTask(task.toObject(), titles) }, { status: 201 });
}
