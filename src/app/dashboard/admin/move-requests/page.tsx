"use client";

import { MoveRequestsView } from "@/components/move-requests/MoveRequestsView";
import { adminNav } from "@/config/dashboardNav";

const AdminMoveRequestsPage = () => {
  return <MoveRequestsView nav={adminNav} roleName="Admin" />;
};

export default AdminMoveRequestsPage;
