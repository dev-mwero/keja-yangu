import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
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

export async function GET() {
  await connectToDatabase();
  const properties = await Property.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json({ data: properties });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = propertyInput.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const property = await Property.create(parsed.data);
  return NextResponse.json({ data: property }, { status: 201 });
}
