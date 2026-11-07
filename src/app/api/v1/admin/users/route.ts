import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { escapeRegex, requireRoleManagementActor } from "@/app/api/v1/admin/users/_guard";
import { buildPaginationResult, parsePagination } from "@/lib/pagination";
import { isUserRole } from "@/lib/role-management";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";

interface UserListDoc {
  _id: unknown;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isActive?: boolean;
  managedByOwnerId?: string;
  createdAt?: Date;
}

function serialize(user: UserListDoc) {
  return {
    id: String(user._id),
    name: user.name ?? "",
    email: user.email ?? "",
    phone: user.phone ?? "",
    role: user.role ?? "",
    isActive: user.isActive !== false,
    managedByOwnerId: user.managedByOwnerId ?? "",
    createdAt: user.createdAt ?? null,
  };
}

/** Paginated, filterable list of platform users. System-admin only. */
export async function GET(request: NextRequest) {
  const actor = await requireRoleManagementActor(request);
  if (actor instanceof NextResponse) return actor;

  const { page, limit } = parsePagination({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  const params = request.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};

  const role = params.get("role")?.trim();
  if (role && isUserRole(role)) filter.role = role;

  const active = params.get("active")?.trim();
  if (active === "true" || active === "false") filter.isActive = active === "true";

  const search = (params.get("search") ?? params.get("q") ?? "").trim().slice(0, 100);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }

  const [items, total] = await Promise.all([
    User.find(filter)
      .select("name email phone role isActive managedByOwnerId createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return NextResponse.json(
    buildPaginationResult(
      (items as unknown as UserListDoc[]).map(serialize),
      total as number,
      page,
      limit,
    ),
  );
}
