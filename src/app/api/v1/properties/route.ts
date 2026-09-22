import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { Property } from "@/models/Property";

const propertyInput = z.object({
  title: z.string().trim().min(1),
  type: z.enum(["room", "apartment", "building"]).optional(),
  location: z.string().trim().min(1),
  price: z.coerce.number().nonnegative(),
  beds: z.coerce.number().int().nonnegative(),
  baths: z.coerce.number().int().nonnegative(),
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

export async function GET(request: NextRequest) {
  await connectToDatabase();
  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  const skip = (page - 1) * limit;

  const [properties, total] = await Promise.all([
    Property.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Property.countDocuments(),
  ]);

  const result = buildPaginationResult(properties, total, page, limit);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authError = await requireAuth(request, ["owner", "caretaker"]);
  if (authError) return authError;

  const body = await request.json();
  const parsed = propertyInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = getAuthUser(request);
  const data = { ...parsed.data, ownerId: user?.userId };
  await connectToDatabase();
  const property = await Property.create(data);
  return NextResponse.json({ data: property }, { status: 201 });
}
