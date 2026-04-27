import {
  Home,
  Building2,
  Wrench,
  Calculator,
  FileBarChart,
  MessagesSquare,
  Settings,
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