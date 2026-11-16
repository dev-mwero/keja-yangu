import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { propertyTitleMap, readJsonBody, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { taskUpdate } from "@/lib/schemas/task";
import { serializeTask } from "@/lib/tasks";
import { Task } from "@/models/Task";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "task:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const task = await Task.findById(id).lean();
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const actor = await resolveDashboardActor(request, "task:read-own");
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && !actor.assignedPropertyIds.includes(task.propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (actor.role === "custodian" && task.ownerId !== actor.managedByOwnerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const titles = await propertyTitleMap([task.propertyId]);
  return NextResponse.json({ data: serializeTask(task, titles) });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "task:manage");
  if (authError) return authError;

  await connectToDatabase();
  const task = await Task.findById(id).lean();
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const actor = await resolveDashboardActor(request, "task:manage");
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && !actor.assignedPropertyIds.includes(task.propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (actor.role === "custodian" && task.ownerId !== actor.managedByOwnerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await readJsonBody(request);
  const parsed = taskUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid task payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.priority !== undefined) updateData.priority = parsed.data.priority;
  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === "done") {
      updateData.completedAt = new Date().toISOString();
    } else {
      updateData.completedAt = "";
    }
  }
  if (parsed.data.assignedTo !== undefined) updateData.assignedTo = parsed.data.assignedTo;
  if (parsed.data.assignedToName !== undefined)
    updateData.assignedToName = parsed.data.assignedToName;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = parsed.data.dueDate;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.completedAt !== undefined) updateData.completedAt = parsed.data.completedAt;

  const updated = await Task.findOneAndUpdate(
    { _id: id, ownerId: task.ownerId, propertyId: task.propertyId },
    updateData,
    { new: true, runValidators: true },
  ).lean();
  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const titles = await propertyTitleMap([updated.propertyId]);
  return NextResponse.json({ data: serializeTask(updated, titles) });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 20 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "task:manage");
  if (authError) return authError;

  await connectToDatabase();
  const task = await Task.findById(id).lean();
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const actor = await resolveDashboardActor(request, "task:manage");
  if (actor instanceof NextResponse) return actor;

  if (actor.role === "caretaker" && !actor.assignedPropertyIds.includes(task.propertyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await Task.deleteOne({ _id: id });
  return NextResponse.json({ data: { id } });
}
