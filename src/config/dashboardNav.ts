import {
  Home,
  Building2,
  Wrench,
  Calculator,
  FileBarChart,
  MessagesSquare,
  Settings,
  CreditCard,
  AlertTriangle,
  Megaphone,
  FileText,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/config/roleRoutes";

export interface DashNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const sections = [
  { slug: "", label: "Overview", icon: Home },
  { slug: "/portfolio", label: "Portfolio", icon: Building2 },
  { slug: "/tasks", label: "Tasks & Maintenance", icon: Wrench },
  { slug: "/accounting", label: "Accounting", icon: Calculator },
  { slug: "/reports", label: "Reports", icon: FileBarChart },
  { slug: "/communications", label: "Communications", icon: MessagesSquare },
  { slug: "/documents", label: "Tenant Documents", icon: FileText },
  { slug: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * Build the sidebar nav for a given role. The "Overview" entry points to the
 * role's root dashboard route; every other entry points to a real sub-route.
 */
export const buildDashboardNav = (role: Exclude<Role, "tenant">): DashNavItem[] => {
  const base = `/dashboard/${role}`;
  return sections.map((s) => ({
    to: `${base}${s.slug}`,
    label: s.label,
    icon: s.icon,
  }));
};

export const ownerNav = buildDashboardNav("owner");
export const caretakerNav = buildDashboardNav("caretaker");

/**
 * Tenant sidebar — distinct from owner/caretaker because tenants don't
 * manage portfolios. They focus on their own home, payments, and requests.
 * Order is intentional: most-used items first.
 */
interface TenantSection {
  slug: string;
  label: string;
  icon: LucideIcon;
  /** When set, the link points outside the tenant dashboard tree. */
  external?: string;
}

const tenantSections: TenantSection[] = [
  { slug: "", label: "Overview", icon: Home },
  { slug: "/browse", label: "Browse homes", icon: Search, external: "/properties" },
  { slug: "/applications", label: "Applications", icon: FileText },
  { slug: "/payments", label: "Payments", icon: CreditCard },
  { slug: "/complaints", label: "Complaints", icon: AlertTriangle },
  { slug: "/chat", label: "Chat", icon: MessagesSquare },
  { slug: "/announcements", label: "Announcements", icon: Megaphone },
  { slug: "/reports", label: "Reports", icon: FileBarChart },
  { slug: "/documents", label: "Documents", icon: FileText },
  { slug: "/settings", label: "Settings", icon: Settings },
];

export const tenantNav: DashNavItem[] = tenantSections.map((s) => ({
  to: s.external ?? `/dashboard/tenant${s.slug}`,
  label: s.label,
  icon: s.icon,
}));

/** Sub-route slugs owned by the tenant dashboard (used by the role-route guard). */
export const tenantSubRoutes = tenantSections
  .filter((s) => !s.external && s.slug)
  .map((s) => `/dashboard/tenant${s.slug}`);