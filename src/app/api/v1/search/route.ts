import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongoose";
import { authenticate } from "@/lib/permissions";
import { Invoice } from "@/models/Invoice";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { Unit } from "@/models/Unit";
import { User } from "@/models/User";

export interface SearchResult {
  id: string;
  type: "property" | "unit" | "tenant" | "lease" | "invoice" | "staff";
  title: string;
  subtitle: string;
  href: string;
}

const LIMIT = 5;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ data: [] as SearchResult[] });
  }

  await connectToDatabase();
  const user = await User.findById(auth.userId).select("role isActive managedByOwnerId").lean();
  if (!user?.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = user.role;
  const regex = new RegExp(escapeRegex(q), "i");
  const results: SearchResult[] = [];

  // Owner-scope used by owner/custodian; caretaker is further limited to
  // assigned properties.
  let scopeOwnerId: string | null = null;
  let assignedPropertyIds: string[] | null = null;

  if (role === "owner") {
    scopeOwnerId = String(user._id);
  } else if (role === "custodian") {
    if (!user.managedByOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    scopeOwnerId = user.managedByOwnerId;
  } else if (role === "caretaker") {
    if (!user.managedByOwnerId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    scopeOwnerId = user.managedByOwnerId;
    const assigned = await Property.find({ caretakerIds: String(user._id) })
      .select("_id")
      .lean();
    assignedPropertyIds = assigned.map((p) => String(p._id));
  } else if (role === "tenant") {
    const tenantDoc = await Tenant.findOne({ userId: String(user._id) })
      .select("_id")
      .lean();
    const tenantId = tenantDoc ? String(tenantDoc._id) : "";
    const ownUnits = await Unit.find({ tenantId: String(user._id) }).lean();
    for (const unit of ownUnits.slice(0, LIMIT)) {
      results.push({
        id: String(unit._id),
        type: "unit",
        title: `Unit ${unit.name}`,
        subtitle: unit.blockName,
        href: "/dashboard/tenant",
      });
    }
    if (tenantId) {
      const invoices = await Invoice.find({ tenantId, invoiceNumber: regex }).limit(LIMIT).lean();
      for (const inv of invoices) {
        results.push({
          id: String(inv._id),
          type: "invoice",
          title: inv.invoiceNumber,
          subtitle: `Invoice · ${inv.period}`,
          href: "/dashboard/tenant/payments",
        });
      }
    }
    return NextResponse.json({ data: results });
  } else if (role !== "system-admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownerFilter = scopeOwnerId ? { ownerId: scopeOwnerId } : {};
  const scriptFilter: Record<string, unknown> = { ...ownerFilter };
  if (assignedPropertyIds) scriptFilter.propertyId = { $in: assignedPropertyIds };

  const [properties, units, tenants, invoices, staff] = await Promise.all([
    Property.find({
      ...ownerFilter,
      $or: [{ title: regex }, { location: regex }],
      ...(assignedPropertyIds ? { _id: { $in: assignedPropertyIds } } : {}),
    })
      .limit(LIMIT)
      .lean(),
    Unit.find({
      ...scriptFilter,
      $or: [{ name: regex }, { blockName: regex }],
    })
      .limit(LIMIT)
      .lean(),
    role === "system-admin" || scopeOwnerId
      ? Tenant.find({
          ...ownerFilter,
          ...(assignedPropertyIds ? { propertyId: { $in: assignedPropertyIds } } : {}),
          $or: [{ name: regex }, { email: regex }, { phone: regex }],
        })
          .limit(LIMIT)
          .lean()
      : Promise.resolve([]),
    Invoice.find({
      ...scriptFilter,
      $or: [{ invoiceNumber: regex }, { period: regex }],
    })
      .limit(LIMIT)
      .lean(),
    role === "system-admin"
      ? User.find({ $or: [{ name: regex }, { email: regex }] })
          .limit(LIMIT)
          .lean()
      : Promise.resolve([]),
  ]);

  for (const p of properties) {
    results.push({
      id: String(p._id),
      type: "property",
      title: p.title,
      subtitle: p.location,
      href:
        role === "system-admin"
          ? "/dashboard/system-admin/portfolio"
          : "/dashboard/owner/portfolio",
    });
  }
  for (const u of units) {
    results.push({
      id: String(u._id),
      type: "unit",
      title: `Unit ${u.name}`,
      subtitle: u.blockName,
      href: role === "caretaker" ? "/dashboard/caretaker/units" : "/dashboard/owner/units",
    });
  }
  for (const t of tenants) {
    results.push({
      id: String(t._id),
      type: "tenant",
      title: t.name,
      subtitle: t.email,
      href: role === "caretaker" ? "/dashboard/caretaker/tenants" : "/dashboard/owner/tenants",
    });
  }
  for (const inv of invoices) {
    results.push({
      id: String(inv._id),
      type: "invoice",
      title: inv.invoiceNumber,
      subtitle: `Invoice · ${inv.period}`,
      href:
        role === "caretaker" ? "/dashboard/caretaker/accounting" : "/dashboard/owner/accounting",
    });
  }
  for (const s of staff) {
    results.push({
      id: String(s._id),
      type: "staff",
      title: s.name || s.email || String(s._id),
      subtitle: s.role,
      href: "/dashboard/system-admin",
    });
  }

  return NextResponse.json({ data: results.slice(0, 20) });
}
