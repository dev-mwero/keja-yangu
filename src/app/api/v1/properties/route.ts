import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { Property } from "@/models/Property";

const propertyInput = z.object({
  title: z.string().trim().min(1),
  location: z.string().trim().min(1),
  price: z.coerce.number().nonnegative(),
  bedrooms: z.coerce.number().int().nonnegative(),
  bathrooms: z.coerce.number().int().nonnegative(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  available: z.boolean().optional(),
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
