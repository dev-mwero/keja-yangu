import jwt from "jsonwebtoken";
import { isValidObjectId } from "mongoose";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { Property } from "@/models/Property";

const propertyUpdate = z.object({
  title: z.string().trim().min(1).optional(),
  type: z.enum(["room", "apartment", "building"]).optional(),
  location: z.string().trim().min(1).optional(),
  price: z.coerce.number().nonnegative().optional(),
  beds: z.coerce.number().int().nonnegative().optional(),
  baths: z.coerce.number().int().nonnegative().optional(),
  area: z.coerce.number().nonnegative().optional(),
  images: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  status: z.enum(["available", "occupied", "maintenance"]).optional(),
  ownerId: z.string().optional(),
  caretakerIds: z.array(z.string()).optional(),
  description: z.string().optional(),
});

function getAuthUser(request: NextRequest) {
  const token = request.cookies.get("keja-token")?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET ?? "fallback-secret") as {
      userId: string;
      role: string;
    };
  } catch {
    return null;
  }
}

async function requireAuth(request: NextRequest, roles?: string[]) {
  const user = getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (roles && !roles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id))
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
  await connectToDatabase();
  const property = await Property.findById(id).lean();
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  return NextResponse.json({ data: property });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id))
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });

  const authError = await requireAuth(request, ["owner"]);
  if (authError) return authError;

  const body = await request.json();
  const parsed = propertyUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const property = await Property.findOneAndUpdate({ _id: id }, parsed.data, {
    new: true,
    runValidators: true,
  }).lean();
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  return NextResponse.json({ data: property });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidObjectId(id))
    return NextResponse.json({ error: "Invalid property id" }, { status: 400 });

  const authError = await requireAuth(request, ["owner"]);
  if (authError) return authError;

  await connectToDatabase();
  const property = await Property.findOneAndDelete({ _id: id }).lean();
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  return NextResponse.json({ data: property });
}
