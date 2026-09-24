import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  type DashboardActor,
  isDuplicateKeyError,
  propertyTitleMap,
  readJsonBody,
  resolveDashboardActor,
} from "@/app/api/v1/_helpers";
import { serializeThread, type ThreadEnrichment } from "@/lib/chat";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { requirePermission } from "@/lib/permissions";
import { checkSameOrigin, rateLimit } from "@/lib/rate-limit";
import { chatThreadInput } from "@/lib/schemas";
import { ChatMessage } from "@/models/ChatMessage";
import { ChatThread } from "@/models/ChatThread";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const authError = await requirePermission(request, "chat:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;

  const filter: Record<string, unknown> = {};
  if (actor.role === "tenant") {
    if (actor.tenantIds.length === 0) {
      return NextResponse.json(buildPaginationResult([], 0, page, limit));
    }
    filter.tenantId = { $in: actor.tenantIds };
  } else if (actor.role === "owner") {
    filter.ownerId = actor.userId;
  } else if (actor.role === "caretaker") {
    filter.agentUserId = actor.userId;
  }

  const [threads, total] = await Promise.all([
    ChatThread.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean(),
    ChatThread.countDocuments(filter),
  ]);

  const agentNames = new Map(
    (
      await User.find({ _id: { $in: threads.map((thread) => thread.agentUserId) } })
        .select("name")
        .lean()
    ).map((user) => [String(user._id), user.name]),
  );
  const tenantNames = new Map(
    (
      await Tenant.find({ _id: { $in: threads.map((thread) => thread.tenantId) } })
        .select("name")
        .lean()
    ).map((tenant) => [String(tenant._id), tenant.name]),
  );
  const titles = await propertyTitleMap(threads.map((thread) => thread.propertyId));

  const data: ReturnType<typeof serializeThread>[] = [];
  for (const thread of threads) {
    const readAt = actor.role === "tenant" ? thread.tenantLastReadAt : thread.agentLastReadAt;
    const unreadFilter: Record<string, unknown> = {
      threadId: String(thread._id),
      senderUserId: { $ne: actor.userId },
    };
    if (readAt) unreadFilter.createdAt = { $gt: readAt };
    const unread = await ChatMessage.countDocuments(unreadFilter);

    const enrichment: ThreadEnrichment = {
      agentName: agentNames.get(thread.agentUserId) ?? "Property team",
      tenantName: tenantNames.get(thread.tenantId) ?? "Tenant",
      propertyTitle: titles.get(thread.propertyId) ?? "",
      unread,
    };
    data.push(serializeThread(thread, enrichment));
  }

  return NextResponse.json(buildPaginationResult(data, total, page, limit));
}

export async function POST(request: NextRequest) {
  const limit = await rateLimit(request, { windowMs: 60_000, limit: 10 });
  if (limit instanceof NextResponse) return limit;

  const originError = checkSameOrigin(request);
  if (originError) return originError;

  const authError = await requirePermission(request, "chat:send");
  if (authError) return authError;

  const body = await readJsonBody(request);
  const parsed = chatThreadInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid thread payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;
  if (actor.role !== "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await Tenant.find({ userId: actor.userId }).select("_id propertyId ownerId").lean();
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No active tenancy found. Contact your landlord to be linked to a property." },
      { status: 403 },
    );
  }

  const propertyIds = [...new Set(rows.map((row) => row.propertyId))];
  let propertyId = parsed.data.propertyId;
  let row: (typeof rows)[number] | undefined;
  if (propertyIds.length === 1) {
    propertyId = propertyIds[0];
    row = rows.find((candidate) => candidate.propertyId === propertyId);
  } else {
    if (!propertyId) {
      return NextResponse.json(
        { error: "Property is required — your account maps to multiple properties" },
        { status: 400 },
      );
    }
    row = rows.find((candidate) => candidate.propertyId === propertyId);
    if (!row) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (!propertyId || !row) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const property = await Property.findById(propertyId).select("ownerId caretakerIds").lean();
  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }
  const recipientId = parsed.data.recipientId;
  const agentMatchesRole =
    (parsed.data.role === "owner" && property.ownerId === recipientId) ||
    (parsed.data.role === "caretaker" && (property.caretakerIds ?? []).includes(recipientId));
  if (!agentMatchesRole) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const agent = await User.findById(recipientId).select("role").lean();
  if (!agent || agent.role !== parsed.data.role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  try {
    const thread = await ChatThread.create({
      tenantId: String(row._id),
      propertyId,
      ownerId: row.ownerId,
      agentUserId: recipientId,
      agentRole: parsed.data.role,
      lastMessageAt: now,
      lastMessageText: "",
      tenantLastReadAt: now,
      agentLastReadAt: now,
    });
    const data = await buildThreadResponse(
      String(thread._id),
      String(row._id),
      recipientId,
      propertyId,
      actor,
    );
    console.info(
      `[chat] start-thread actor=${actor.userId} role=${actor.role} thread=${String(thread._id)}`,
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const existing = await ChatThread.findOne({
      tenantId: String(row._id),
      propertyId,
      agentUserId: recipientId,
    }).lean();
    if (!existing) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    const data = await buildThreadResponse(
      String(existing._id),
      String(existing.tenantId),
      existing.agentUserId,
      existing.propertyId,
      actor,
    );
    return NextResponse.json({ data }, { status: 200 });
  }
}

async function buildThreadResponse(
  threadId: string,
  tenantId: string,
  agentUserId: string,
  propertyId: string,
  actor: DashboardActor,
) {
  const thread = await ChatThread.findById(threadId).lean();
  if (!thread) {
    return null;
  }
  const [agentUser, tenantRow] = await Promise.all([
    User.findById(agentUserId).select("name").lean(),
    Tenant.findById(tenantId).select("name").lean(),
  ]);
  const titles = await propertyTitleMap([propertyId]);
  const readAt = actor.role === "tenant" ? thread.tenantLastReadAt : thread.agentLastReadAt;
  const unreadFilter: Record<string, unknown> = {
    threadId,
    senderUserId: { $ne: actor.userId },
  };
  if (readAt) unreadFilter.createdAt = { $gt: readAt };
  const unread = await ChatMessage.countDocuments(unreadFilter);
  return serializeThread(thread, {
    agentName: agentUser?.name ?? "Property team",
    tenantName: tenantRow?.name ?? "Tenant",
    propertyTitle: titles.get(propertyId) ?? "",
    unread,
  });
}
