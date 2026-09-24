import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("-passwordHash").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "caretaker" || user.role === "tenant") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerId = request.nextUrl.searchParams.get("ownerId");
  const filter: Record<string, unknown> = { role: "caretaker" };

  if (user.role === "system-admin") {
    if (ownerId) filter.managedByOwnerId = ownerId;
  } else {
    if (ownerId && ownerId !== String(user._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    filter.managedByOwnerId = String(user._id);
  }

  const caretakers = await User.find(filter)
    .select("name email managedByOwnerId privileges")
    .sort({ name: 1 })
    .lean();

  const ids = caretakers.map((c) => String(c._id));
  let counts: Array<{ _id: string; count: number }> = [];
  if (ids.length > 0) {
    counts = await Property.aggregate<{ _id: string; count: number }>([
      { $unwind: "$caretakerIds" },
      { $match: { caretakerIds: { $in: ids } } },
      { $group: { _id: "$caretakerIds", count: { $sum: 1 } } },
    ]);
  }

  const countByCaretaker = new Map(counts.map((c) => [String(c._id), c.count]));
  const data = caretakers.map((c) => ({
    id: String(c._id),
    name: c.name,
    email: c.email,
    managedByOwnerId: c.managedByOwnerId ?? "",
    privileges: c.privileges ?? [],
    propertyCount: countByCaretaker.get(String(c._id)) ?? 0,
  }));

  return NextResponse.json({ data });
}
