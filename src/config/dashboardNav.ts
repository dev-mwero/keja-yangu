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

export interface DashNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

type Role = "tenant" | "caretaker" | "owner";

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
