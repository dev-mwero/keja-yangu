import { describe, expect, it } from "vitest";
import {
  adminNav,
  brokerNav,
  caretakerNav,
  custodianNav,
  ownerNav,
  tenantNav,
  tenantSubRoutes,
} from "@/config/dashboardNav";

describe("tenant navigation", () => {
  it("includes the tenant discovery and favourites entries", () => {
    expect(tenantNav.map((item) => item.label)).toEqual([
      "Overview",
      "Browse",
      "Favourites",
      "My Home",
      "Requests",
      "Payments",
      "Messages",
      "Documents",
      "Notifications",
      "Settings",
    ]);
  });

  it("routes each entry to its consolidated page, keeping Browse external", () => {
    expect(tenantNav.map((item) => item.to)).toEqual([
      "/dashboard/tenant",
      "/properties",
      "/dashboard/tenant/favourites",
      "/dashboard/tenant/home",
      "/dashboard/tenant/requests",
      "/dashboard/tenant/payments",
      "/dashboard/tenant/messages",
      "/dashboard/tenant/documents",
      "/dashboard/tenant/notifications",
      "/dashboard/tenant/settings",
    ]);
  });

  it("derives sub-routes from the internal entries only", () => {
    expect(tenantSubRoutes).toEqual([
      "/dashboard/tenant/favourites",
      "/dashboard/tenant/home",
      "/dashboard/tenant/requests",
      "/dashboard/tenant/payments",
      "/dashboard/tenant/messages",
      "/dashboard/tenant/documents",
      "/dashboard/tenant/notifications",
      "/dashboard/tenant/settings",
    ]);
  });
});

describe("admin navigation", () => {
  it("provides full admin dashboard sections pointing to /dashboard/admin", () => {
    expect(adminNav.some((item) => item.to === "/dashboard/admin")).toBe(true);
    expect(adminNav.some((item) => item.to === "/dashboard/admin/portfolio")).toBe(true);
    expect(adminNav.some((item) => item.to === "/dashboard/admin/units")).toBe(true);
    expect(adminNav.some((item) => item.to === "/dashboard/admin/tenants")).toBe(true);
    expect(adminNav.some((item) => item.to === "/dashboard/admin/accounting")).toBe(true);
    expect(adminNav.some((item) => item.to === "/dashboard/admin/team")).toBe(true);
    expect(adminNav.some((item) => item.to === "/dashboard/admin/brokers")).toBe(true);
  });
});

describe("manager navigation is unaffected", () => {
  it("keeps the full owner sections", () => {
    expect(ownerNav.some((item) => item.to === "/dashboard/owner/applications")).toBe(true);
    expect(ownerNav.some((item) => item.to === "/dashboard/owner/move-requests")).toBe(true);
  });

  it("still hides applications from caretakers", () => {
    expect(caretakerNav.some((item) => item.to === "/dashboard/caretaker/applications")).toBe(
      false,
    );
  });
});

describe("custodian navigation", () => {
  it("includes Communications", () => {
    expect(custodianNav.some((item) => item.to === "/dashboard/custodian/communications")).toBe(
      true,
    );
  });
});

describe("broker navigation", () => {
  it("includes broker specific sections pointing to /dashboard/broker", () => {
    expect(brokerNav.map((item) => item.to)).toEqual([
      "/dashboard/broker",
      "/dashboard/broker/listings",
      "/dashboard/broker/authorizations",
      "/dashboard/broker/prospects",
      "/dashboard/broker/commissions",
      "/dashboard/broker/profile",
    ]);
  });
});
