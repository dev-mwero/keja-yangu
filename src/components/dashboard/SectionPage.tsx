import { ReactNode } from "react";
import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import type { DashNavItem } from "@/config/dashboardNav";

interface Props {
  role: string;
  nav: DashNavItem[];
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Short tagline shown in the hero card */
  tagline?: string;
  children?: ReactNode;
}

/**
 * Generic placeholder page used for dashboard sub-sections that don't yet
 * have their full feature set built out. Renders a hero card + optional
 * children so we can incrementally fill each section in.
 */
export const SectionPage = ({ role, nav, title, subtitle, icon: Icon, tagline, children }: Props) => {
  return (
    <DashboardShell role={role} nav={nav} title={title} subtitle={subtitle}>
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-2xl border border-border bg-card p-6 shadow-soft md:p-8"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
            {tagline && <p className="mt-1 max-w-xl text-sm text-muted-foreground">{tagline}</p>}
          </div>
        </div>
        {children && <div className="mt-8">{children}</div>}
      </motion.section>
    </DashboardShell>
  );
};