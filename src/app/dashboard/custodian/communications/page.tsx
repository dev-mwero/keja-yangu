"use client";

import { useState } from "react";
import { StaffAnnouncementsPanel } from "@/components/communications/StaffAnnouncementsPanel";
import { StaffChatPanel } from "@/components/communications/StaffChatPanel";
import { DashboardShell } from "@/components/DashboardShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { custodianNav as nav } from "@/config/dashboardNav";

type Tab = "chat" | "announcements";

const CustodianCommunicationsPage = () => {
  const [tab, setTab] = useState<Tab>("announcements");

  return (
    <DashboardShell
      roleName="Custodian"
      nav={nav}
      title="Communications"
      subtitle="Message tenants and broadcast announcements across the portfolio."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
          <TabsTrigger value="chat">Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="announcements" className="mt-6">
          <StaffAnnouncementsPanel />
        </TabsContent>
        <TabsContent value="chat" className="mt-6">
          <StaffChatPanel />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
};

export default CustodianCommunicationsPage;
