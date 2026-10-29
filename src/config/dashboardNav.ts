import {
  ArrowLeftRight,
  Bell,
  Building2,
  Calculator,
  CreditCard,
  DoorOpen,
  FileBarChart,
  FileText,
  Heart,
  Home,
  type LucideIcon,
  MessagesSquare,
  Search,
  Settings,
  Tags,
  Trash2,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";

export interface DashNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

type Role = "tenant" | "caretaker" | "custodian" | "owner" | "system-admin";

interface Section {
  slug: string;
  label: string;
  icon: LucideIcon;
}

const baseSections = [
  { slug: "", label: "Overview", icon: Home },
  { slug: "/portfolio", label: "Portfolio", icon: Building2 },
  { slug: "/units", label: "Units", icon: DoorOpen },
  { slug: "/tenants", label: "Tenants", icon: Users },
  { slug: "/applications", label: "Applications", icon: FileText },
  { slug: "/move-requests", label: "Move Requests", icon: ArrowLeftRight },
  { slug: "/team", label: "Team", icon: UserCog },
  { slug: "/tasks", label: "Tasks & Maintenance", icon: Wrench },
  { slug: "/accounting", label: "Accounting", icon: Calculator },
  { slug: "/reports", label: "Reports", icon: FileBarChart },
  { slug: "/communications", label: "Communications", icon: MessagesSquare },
  { slug: "/documents", label: "Tenant Documents", icon: FileText },
  { slug: "/notifications", label: "Notifications", icon: Bell },
  { slug: "/settings", label: "Settings", icon: Settings },
] satisfies readonly Section[];

const caretakerSections = baseSections.filter(
  (s) => s.slug !== "/tenants" && s.slug !== "/team" && s.slug !== "/applications",
);
const custodianSections = baseSections.filter((s) =>
  [
    "",
    "/portfolio",
    "/units",
    "/tenants",
    "/applications",
    "/move-requests",
    "/team",
    "/accounting",
    "/communications",
    "/notifications",
    "/settings",
  ].includes(s.slug),
);
const systemAdminSections = baseSections.filter((s) =>
  ["", "/portfolio", "/tenants", "/notifications", "/accounting"].includes(s.slug),
);

export const buildDashboardNav = (role: Exclude<Role, "tenant">): DashNavItem[] => {
  const base = `/dashboard/${role}`;
  let sectionsToUse = baseSections;
  if (role === "caretaker") sectionsToUse = caretakerSections;
  if (role === "custodian") sectionsToUse = custodianSections;
  if (role === "system-admin") sectionsToUse = systemAdminSections;
  return sectionsToUse.map((s) => ({
    to: `${base}${s.slug}`,
    label: s.label,
    icon: s.icon,
  }));
};

export const ownerNav = buildDashboardNav("owner");
export const caretakerNav = buildDashboardNav("caretaker");
export const custodianNav = buildDashboardNav("custodian");

export const caretakerNavWithTenants: DashNavItem[] = [
  ...caretakerNav,
  { to: "/dashboard/caretaker/tenants", label: "Tenants", icon: Users },
  { to: "/dashboard/caretaker/applications", label: "Applications", icon: FileText },
];

export const systemAdminNav: DashNavItem[] = [
  ...buildDashboardNav("system-admin"),
  {
    to: "/dashboard/system-admin/property-types",
    label: "Property Types",
    icon: Tags,
  },
  { to: "/dashboard/system-admin/recycle-bin", label: "Recycle Bin", icon: Trash2 },
];

interface TenantSection {
  slug: string;
  label: string;
  icon: LucideIcon;
  external?: string;
}

const tenantSections: TenantSection[] = [
  { slug: "", label: "Overview", icon: Home },
  { slug: "/browse", label: "Browse", icon: Search, external: "/properties" },
  { slug: "/favourites", label: "Favourites", icon: Heart },
  { slug: "/home", label: "My Home", icon: DoorOpen },
  { slug: "/requests", label: "Requests", icon: ArrowLeftRight },
  { slug: "/payments", label: "Payments", icon: CreditCard },
  { slug: "/messages", label: "Messages", icon: MessagesSquare },
  { slug: "/documents", label: "Documents", icon: FileText },
  { slug: "/notifications", label: "Notifications", icon: Bell },
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
