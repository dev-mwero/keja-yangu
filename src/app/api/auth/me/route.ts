import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { connectToDatabase } from "@/lib/mongoose";
import { User } from "@/models/User";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader?.split("; ").find((c) => c.startsWith("keja-token="))?.split("=")[1];
    if (!token) {
      return NextResponse.json({ error: "No token" }, { status: 401 });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "fallback-secret") as { userId: string };
    await connectToDatabase();
    const user = await User.findById(decoded.userId).select("-passwordHash").lean();
    if (!user?.isActive) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    return NextResponse.json({ user: { email: user.email, name: user.name, role: user.role } });
  } catch (_error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
