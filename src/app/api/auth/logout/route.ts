import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/jwt";

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

    jwt.verify(token, getJwtSecret());
    const response = NextResponse.json({ message: "OK" });
    response.cookies.set("keja-token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    return response;
  } catch (_error) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}
