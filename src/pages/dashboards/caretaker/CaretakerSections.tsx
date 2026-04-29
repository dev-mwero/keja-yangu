import { Building2, Wrench, Calculator, FileBarChart, MessagesSquare, Settings as SettingsIcon, FileText } from "lucide-react";
import { SectionPage } from "@/components/dashboard/SectionPage";
import { caretakerNav } from "@/config/dashboardNav";
import { PortfolioSection } from "@/components/dashboard/sections/PortfolioSection";
import { TasksSection } from "@/components/dashboard/sections/TasksSection";
import { AccountingSection } from "@/components/dashboard/sections/AccountingSection";
import { ReportsSection } from "@/components/dashboard/sections/ReportsSection";
import { CommunicationsSection } from "@/components/dashboard/sections/CommunicationsSection";
import { SettingsSection } from "@/components/dashboard/sections/SettingsSection";
import { ShareDocumentsSection } from "@/components/dashboard/sections/ShareDocumentsSection";

const role = "Caretaker";
const CARETAKER_ID = "c1";

export const CaretakerPortfolioPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Portfolio" subtitle="Properties assigned to you."
    icon={Building2} tagline="The buildings and units you currently look after.">
    <PortfolioSection caretakerId={CARETAKER_ID} />
  </SectionPage>
);

export const CaretakerTasksPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Tasks & Maintenance" subtitle="Your work queue."
    icon={Wrench} tagline="Day-to-day jobs and maintenance tickets that need your attention.">
    <TasksSection />
  </SectionPage>
);

export const CaretakerAccountingPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Accounting" subtitle="Rent collection on assigned units."
    icon={Calculator} tagline="Track payments coming in for the units you manage.">
    <AccountingSection />
  </SectionPage>
);

export const CaretakerReportsPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Reports" subtitle="Operational summaries."
    icon={FileBarChart} tagline="Download activity reports for the properties under your care.">
    <ReportsSection />
  </SectionPage>
);

export const CaretakerCommunicationsPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Communications" subtitle="Tenant chats and announcements."
    icon={MessagesSquare} tagline="Reply to tenant messages and post building-wide notices.">
    <CommunicationsSection />
  </SectionPage>
);

export const CaretakerDocumentsPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Tenant Documents" subtitle="Share files with your tenants."
    icon={FileText} tagline="Send leases, receipts and notices straight to a tenant's dashboard.">
    <ShareDocumentsSection source="caretaker" />
  </SectionPage>
);

export const CaretakerSettingsPage = () => (
  <SectionPage role={role} nav={caretakerNav} title="Settings" subtitle="Profile and preferences."
    icon={SettingsIcon} tagline="Update your details and notification choices.">
    <SettingsSection />
  </SectionPage>
);