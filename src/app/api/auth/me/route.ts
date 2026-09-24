import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/jwt";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split("; ")
      .find((c) => c.startsWith("keja-token="))
      ?.split("=")[1];
    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string;
    };
    await connectToDatabase();
    const user = await User.findById(decoded.userId).select("-passwordHash").lean();
    if (!user?.isActive) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        privileges: user.privileges ?? [],
        managedByOwnerId: user.managedByOwnerId ?? "",
      },
    });
  } catch (_error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
