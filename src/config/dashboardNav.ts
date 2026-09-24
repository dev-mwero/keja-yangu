import {
  AlertTriangle,
  Building2,
  Calculator,
  CreditCard,
  FileBarChart,
  FileText,
  Home,
  type LucideIcon,
  Megaphone,
  MessagesSquare,
  Search,
  Settings,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";

export interface DashNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

type Role = "tenant" | "caretaker" | "owner" | "system-admin";

interface Section {
  slug: string;
  label: string;
  icon: LucideIcon;
}

const baseSections = [
  { slug: "", label: "Overview", icon: Home },
  { slug: "/portfolio", label: "Portfolio", icon: Building2 },
  { slug: "/tenants", label: "Tenants", icon: Users },
  { slug: "/team", label: "Team", icon: UserCog },
  { slug: "/tasks", label: "Tasks & Maintenance", icon: Wrench },
  { slug: "/accounting", label: "Accounting", icon: Calculator },
  { slug: "/reports", label: "Reports", icon: FileBarChart },
  { slug: "/communications", label: "Communications", icon: MessagesSquare },
  { slug: "/documents", label: "Tenant Documents", icon: FileText },
  { slug: "/settings", label: "Settings", icon: Settings },
] satisfies readonly Section[];

const caretakerSections = baseSections.filter((s) => s.slug !== "/tenants" && s.slug !== "/team");
const systemAdminSections = baseSections.filter((s) => s.slug !== "/team");

export const buildDashboardNav = (role: Exclude<Role, "tenant">): DashNavItem[] => {
  const base = `/dashboard/${role}`;
  let sectionsToUse = baseSections;
  if (role === "caretaker") sectionsToUse = caretakerSections;
  if (role === "system-admin") sectionsToUse = systemAdminSections;
  return sectionsToUse.map((s) => ({
    to: `${base}${s.slug}`,
    label: s.label,
    icon: s.icon,
  }));
};

export const ownerNav = buildDashboardNav("owner");
export const caretakerNav = buildDashboardNav("caretaker");

export const caretakerNavWithTenants: DashNavItem[] = [
  ...caretakerNav,
  { to: "/dashboard/caretaker/tenants", label: "Tenants", icon: Users },
];

export const systemAdminNav: DashNavItem[] = [
  ...buildDashboardNav("system-admin"),
  { to: "/dashboard/system-admin/caretakers", label: "Caretakers", icon: UserCog },
];

interface TenantSection {
  slug: string;
  label: string;
  icon: LucideIcon;
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

export const tenantSubRoutes = tenantSections
  .filter((s) => !s.external && s.slug)
  .map((s) => `/dashboard/tenant${s.slug}`);
