import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveDashboardActor } from "@/app/api/v1/_helpers";
import { connectToDatabase } from "@/lib/mongoose";
import { requirePermission } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

export interface ChatContact {
  userId: string;
  name: string;
  role: "owner" | "caretaker";
  propertyId: string;
  property: string;
}

/**
 * Lists the owner and caretakers a tenant can message, one entry per
 * property they are bound to. Starting a thread only needs `userId`, `role`
 * and `propertyId`, so this is deliberately small.
 */
export async function GET(request: NextRequest) {
  const authError = await requirePermission(request, "chat:read-own");
  if (authError) return authError;

  await connectToDatabase();
  const actor = await resolveDashboardActor(request);
  if (actor instanceof NextResponse) return actor;
  if (actor.role !== "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await Tenant.find({ userId: actor.userId }).select("propertyId").lean();
  const propertyIds = [...new Set(rows.map((row) => row.propertyId).filter(Boolean))];
  if (propertyIds.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const properties = await Property.find({ _id: { $in: propertyIds } })
    .select("_id title ownerId caretakerIds")
    .lean();
  const userIds = [
    ...new Set(properties.flatMap((p) => [p.ownerId, ...(p.caretakerIds ?? [])]).filter(Boolean)),
  ];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name role")
    .lean();
  const usersById = new Map(users.map((user) => [String(user._id), user]));

  const contacts: ChatContact[] = [];
  for (const p of properties) {
    const propertyId = String(p._id);
    const property = p.title ?? "";
    const owner = p.ownerId ? usersById.get(String(p.ownerId)) : undefined;
    if (owner?.role === "owner") {
      contacts.push({
        userId: String(p.ownerId),
        name: owner.name,
        role: "owner",
        propertyId,
        property,
      });
    }
    for (const caretakerId of p.caretakerIds ?? []) {
      const caretaker = usersById.get(String(caretakerId));
      if (caretaker?.role === "caretaker") {
        contacts.push({
          userId: String(caretakerId),
          name: caretaker.name,
          role: "caretaker",
          propertyId,
          property,
        });
      }
    }
  }

  return NextResponse.json({ data: contacts });
}
