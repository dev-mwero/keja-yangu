"use client";

import { MoveRequestsView } from "@/components/move-requests/MoveRequestsView";
import { ownerNav } from "@/config/dashboardNav";

const OwnerMoveRequestsPage = () => {
  return <MoveRequestsView nav={ownerNav} roleName="Owner" />;
};

export default OwnerMoveRequestsPage;
