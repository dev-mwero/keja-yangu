"use client";

import { useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { TenantAnnouncementsPanel } from "@/components/tenant/TenantAnnouncementsPanel";
import { TenantChatPanel } from "@/components/tenant/TenantChatPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tenantNav } from "@/config/dashboardNav";

type Tab = "chat" | "announcements";

const TenantMessagesPage = () => {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <DashboardShell
      roleName="Tenant"
      nav={tenantNav}
      title="Messages"
      subtitle="Chat with your property team and read announcements."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-6">
          <TenantChatPanel />
        </TabsContent>
        <TabsContent value="announcements" className="mt-6">
          <TenantAnnouncementsPanel />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
};

export default TenantMessagesPage;
