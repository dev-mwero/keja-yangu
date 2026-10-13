"use client";

import { MoveRequestsView } from "@/components/move-requests/MoveRequestsView";
import { caretakerNav } from "@/config/dashboardNav";

const CaretakerMoveRequestsPage = () => {
  return <MoveRequestsView nav={caretakerNav} roleName="Caretaker" />;
};

export default CaretakerMoveRequestsPage;
