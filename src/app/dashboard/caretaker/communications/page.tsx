"use client";

import { useState } from "react";
import { StaffAnnouncementsPanel } from "@/components/communications/StaffAnnouncementsPanel";
import { StaffChatPanel } from "@/components/communications/StaffChatPanel";
import { DashboardShell } from "@/components/DashboardShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCaretakerNav } from "@/hooks/use-caretaker-nav";

type Tab = "chat" | "announcements";

const CaretakerCommunicationsPage = () => {
  const nav = useCaretakerNav();
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <DashboardShell
      roleName="Caretaker"
      nav={nav}
      title="Communications"
      subtitle="Reply to tenants and post announcements for your properties."
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="chat">Messages</TabsTrigger>
          <TabsTrigger value="announcements">Announcements</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="mt-6">
          <StaffChatPanel />
        </TabsContent>
        <TabsContent value="announcements" className="mt-6">
          <StaffAnnouncementsPanel />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
};

export default CaretakerCommunicationsPage;
