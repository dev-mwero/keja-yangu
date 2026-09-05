import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongoose";
import { Property } from "@/models/Property";

const propertyUpdate = z.object({
  title: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  price: z.coerce.number().nonnegative().optional(),
  bedrooms: z.coerce.number().int().nonnegative().optional(),
  bathrooms: z.coerce.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  description: z.string().optional(),
  available: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

function invalidId() {
  return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Property not found" }, { status: 404 });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return invalidId();
  }

  await connectToDatabase();
  const property = await Property.findById(id).lean();

  if (!property) {
    return notFound();
  }

  return NextResponse.json({ data: property });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return invalidId();
  }

  const body = await request.json();
  const parsed = propertyUpdate.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid property payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectToDatabase();
  const property = await Property.findByIdAndUpdate(id, parsed.data, {
    new: true,
    runValidators: true,
  }).lean();

  if (!property) {
    return notFound();
  }

  return NextResponse.json({ data: property });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return invalidId();
  }

  await connectToDatabase();
  const property = await Property.findByIdAndDelete(id).lean();

  if (!property) {
    return notFound();
  }

  return NextResponse.json({ data: property });
}
