"use client";

import { MoveRequestsView } from "@/components/move-requests/MoveRequestsView";
import { custodianNav } from "@/config/dashboardNav";

const CustodianMoveRequestsPage = () => {
  return <MoveRequestsView nav={custodianNav} roleName="Custodian" />;
};

export default CustodianMoveRequestsPage;
