import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { type DashboardActor, readJsonBody, resolveDashboardActor } from "@/app/api/v1/_helpers";
import { serializeMessage } from "@/lib/chat";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { chatMessageInput } from "@/lib/schemas";
import { ChatMessage } from "@/models/ChatMessage";
import { ChatThread } from "@/models/ChatThread";
import { User } from "@/models/User";

type ThreadRow = { tenantId: string; ownerId: string; agentUserId: string };

function isParticipant(thread: ThreadRow, actor: DashboardActor): boolean {
  if (actor.role === "system-admin") return true;
  if (actor.role === "tenant") return actor.tenantIds.includes(thread.tenantId);
  if (actor.role === "owner") return thread.ownerId === actor.userId;
  return thread.agentUserId === actor.userId; // caretaker
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "chat:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const thread = await ChatThread.findById(id).lean();
  if (!thread || !isParticipant(thread, actor)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const messages = await ChatMessage.find({ threadId: id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const ordered = [...messages].reverse();

  return NextResponse.json(
    buildPaginationResult(
      ordered.map((message) => serializeMessage(message, actor.userId)),
      ordered.length,
      1,
      100,
    ),
  );
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 30 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const { id } = await context.params;
  if (!isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const authError = await requirePermission(request, "chat:send");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = chatMessageInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid message payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const thread = await ChatThread.findById(id).lean();
  if (!thread || !isParticipant(thread, actor)) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (actor.role === "caretaker") {
    const user = await User.findById(actor.userId).select("privileges").lean();
    if (!user?.privileges?.includes("send_messages")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const message = await ChatMessage.create({
    threadId: id,
    senderUserId: actor.userId,
    senderRole: actor.role,
    text: parsed.data.text,
  });

  const now = new Date();
  const readAtSet = actor.role === "tenant" ? { tenantLastReadAt: now } : { agentLastReadAt: now };
  await ChatThread.updateOne(
    { _id: id },
    { $set: { lastMessageAt: now, lastMessageText: parsed.data.text, ...readAtSet } },
  );

  console.info(`[chat] send-message actor=${actor.userId} role=${actor.role} thread=${id}`);

  return NextResponse.json({ data: serializeMessage(message, actor.userId) }, { status: 201 });
}
