import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

function invalidId() {
  return NextResponse.json({ error: "Invalid property id" }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Property not found" }, { status: 404 });
}

const PropertyModel = Property as any;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!isValidObjectId(id)) {
    return invalidId();
  }

  await connectToDatabase();
  const property = await PropertyModel.findOne({ _id: id }).lean();

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
  const property = await PropertyModel.findOneAndUpdate({ _id: id }, parsed.data, {
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
  const property = await PropertyModel.findOneAndDelete({ _id: id }).lean();

  if (!property) {
    return notFound();
  }

  return NextResponse.json({ data: property });
}
