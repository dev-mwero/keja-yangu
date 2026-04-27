import {
  CreditCard,
  AlertTriangle,
  MessagesSquare,
  Megaphone,
  FileBarChart,
  FileText,
  Settings as SettingsIcon,
} from "lucide-react";
import { SectionPage } from "@/components/dashboard/SectionPage";
import { tenantNav } from "@/config/dashboardNav";
import { ApplicationsSection } from "@/components/dashboard/sections/ApplicationsSection";
import { PaymentsSection } from "@/components/dashboard/sections/PaymentsSection";
import { ComplaintsSection } from "@/components/dashboard/sections/ComplaintsSection";
import { ChatSection } from "@/components/dashboard/sections/ChatSection";
import { AnnouncementsSection } from "@/components/dashboard/sections/AnnouncementsSection";
import { TenantReportsSection } from "@/components/dashboard/sections/TenantReportsSection";
import { DocumentsSection } from "@/components/dashboard/sections/DocumentsSection";
import { SettingsSection } from "@/components/dashboard/sections/SettingsSection";

const role = "Tenant";

export const TenantApplicationsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Applications" subtitle="Track every home you've applied for."
    icon={FileText} tagline="See where each application stands and what to do next.">
    <ApplicationsSection />
  </SectionPage>
);

export const TenantPaymentsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Payments" subtitle="Pay rent and view your receipts."
    icon={CreditCard} tagline="Settle your rent and download statements in one place.">
    <PaymentsSection />
  </SectionPage>
);

export const TenantComplaintsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Complaints" subtitle="Raise issues with your home or building."
    icon={AlertTriangle} tagline="Tell your caretaker what needs attention — we'll keep you posted.">
    <ComplaintsSection />
  </SectionPage>
);

export const TenantChatPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Chat" subtitle="Talk to your caretaker."
    icon={MessagesSquare} tagline="Direct line to the people who keep your home running.">
    <ChatSection />
  </SectionPage>
);

export const TenantAnnouncementsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Announcements" subtitle="Building-wide updates."
    icon={Megaphone} tagline="Notices from your owner and caretaker, in one feed.">
    <AnnouncementsSection />
  </SectionPage>
);

export const TenantReportsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Reports" subtitle="Your personal records."
    icon={FileBarChart} tagline="Download statements and history when you need them.">
    <TenantReportsSection />
  </SectionPage>
);

export const TenantDocumentsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Documents" subtitle="Lease, rules and receipts."
    icon={FileText} tagline="Everything you've signed and received, in one secure folder.">
    <DocumentsSection />
  </SectionPage>
);

export const TenantSettingsPage = () => (
  <SectionPage role={role} nav={tenantNav} title="Settings" subtitle="Profile and preferences."
    icon={SettingsIcon} tagline="Update your details and choose what we notify you about.">
    <SettingsSection />
  </SectionPage>
);