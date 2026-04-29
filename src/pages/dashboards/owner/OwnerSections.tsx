import { Building2, Wrench, Calculator, FileBarChart, MessagesSquare, Settings as SettingsIcon, FileText } from "lucide-react";
import { SectionPage } from "@/components/dashboard/SectionPage";
import { ownerNav } from "@/config/dashboardNav";
import { PortfolioSection } from "@/components/dashboard/sections/PortfolioSection";
import { TasksSection } from "@/components/dashboard/sections/TasksSection";
import { AccountingSection } from "@/components/dashboard/sections/AccountingSection";
import { ReportsSection } from "@/components/dashboard/sections/ReportsSection";
import { CommunicationsSection } from "@/components/dashboard/sections/CommunicationsSection";
import { SettingsSection } from "@/components/dashboard/sections/SettingsSection";
import { ShareDocumentsSection } from "@/components/dashboard/sections/ShareDocumentsSection";

const role = "Owner";

export const OwnerPortfolioPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Portfolio" subtitle="All buildings and units you own."
    icon={Building2} tagline="Browse and manage every property in your portfolio.">
    <PortfolioSection />
  </SectionPage>
);

export const OwnerTasksPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Tasks & Maintenance" subtitle="Track open work across your buildings."
    icon={Wrench} tagline="Assign, prioritise and follow maintenance items through to completion.">
    <TasksSection />
  </SectionPage>
);

export const OwnerAccountingPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Accounting" subtitle="Invoices, payments and balances."
    icon={Calculator} tagline="Monitor cash-flow and reconcile rent collection at a glance.">
    <AccountingSection />
  </SectionPage>
);

export const OwnerReportsPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Reports" subtitle="Export performance insights."
    icon={FileBarChart} tagline="Download the reports your accountant and investors ask for.">
    <ReportsSection />
  </SectionPage>
);

export const OwnerCommunicationsPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Communications" subtitle="Chats and announcements."
    icon={MessagesSquare} tagline="Stay in touch with tenants and broadcast building-wide updates.">
    <CommunicationsSection />
  </SectionPage>
);

export const OwnerDocumentsPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Tenant Documents" subtitle="Share files with your tenants."
    icon={FileText} tagline="Send leases, receipts and notices straight to a tenant's dashboard.">
    <ShareDocumentsSection source="owner" />
  </SectionPage>
);

export const OwnerSettingsPage = () => (
  <SectionPage role={role} nav={ownerNav} title="Settings" subtitle="Profile and preferences."
    icon={SettingsIcon} tagline="Update your details and choose what we notify you about.">
    <SettingsSection />
  </SectionPage>
);