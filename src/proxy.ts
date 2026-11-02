import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getJwtSecret } from "@/lib/jwt";
import { getDashboardAllowedRoles, getRoleRoute, type Role } from "@/lib/role-routes";

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};

function getRoleFromToken(token: string): Role | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { role?: Role };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("keja-token")?.value;

  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }

    const role = getRoleFromToken(token);
    if (!role) {
      return NextResponse.redirect(new URL("/auth", request.url));
    }

    if (pathname === "/dashboard" || pathname === "/dashboard/") {
      return NextResponse.redirect(new URL(getRoleRoute(role), request.url));
    }

    const allowedRoles = getDashboardAllowedRoles(pathname);
    if (!allowedRoles?.includes(role)) {
      return NextResponse.redirect(new URL(getRoleRoute(role), request.url));
    }
  }

  return NextResponse.next();
}
