"use client";

import { ContactMessagesList } from "@/components/contact/ContactMessagesList";
import { DashboardShell } from "@/components/DashboardShell";
import { adminNav } from "@/config/dashboardNav";

const AdminContactMessagesPage = () => (
  <DashboardShell
    roleName="Admin"
    nav={adminNav}
    title="Contact messages"
    subtitle="Inquiries submitted through the public contact form."
  >
    <ContactMessagesList />
  </DashboardShell>
);

export default AdminContactMessagesPage;
