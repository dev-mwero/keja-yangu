"use client";

import { ReactNode } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { DashNavItem } from "@/config/dashboardNav";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  role: string;
  nav: DashNavItem[];
  title: string;
  description?: string;
  icon?: ReactNode;
}

export const PlaceholderPage = ({
  role,
  nav,
  title,
  description = "This section is under development. Check back soon.",
  icon = <Construction className="h-12 w-12 text-muted-foreground" />,
}: PlaceholderPageProps) => {
  return (
    <DashboardShell role={role} nav={nav} title={title}>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-20 text-center">
        {icon}
        <h2 className="mt-4 font-display text-2xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      </div>
    </DashboardShell>
  );
};
