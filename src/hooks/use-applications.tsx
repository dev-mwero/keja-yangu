"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Application,
  listApplicationsForTenant,
  subscribeApplications,
} from "@/lib/applications";

export const useTenantApplications = (tenantEmail: string | undefined) => {
  const [apps, setApps] = useState<Application[]>([]);

  const refresh = useCallback(() => {
    if (!tenantEmail) {
      setApps([]);
      return;
    }
    setApps(listApplicationsForTenant(tenantEmail));
  }, [tenantEmail]);

  useEffect(() => {
    refresh();
    const unsub = subscribeApplications(refresh);
    return unsub;
  }, [refresh]);

  return { applications: apps, refresh };
};
