/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { caretakerPrivilegeActions } from "@/lib/authorization-policy";

describe("caretakerPrivilegeActions", () => {
  it("maps current privileges to target actions and keeps read baseline", () => {
    const result = caretakerPrivilegeActions([
      "edit_property",
      "manage_units",
      "manage_tenants",
      "manage_invoices",
    ]);
    expect(result.actions).toEqual(
      expect.arrayContaining([
        "property:read",
        "unit:read",
        "assignment:read",
        "property:edit",
        "unit:manage",
        "tenant:manage",
        "application:manage",
        "invoice:read",
        "invoice:manage",
        "invoice:mark-paid",
        "invoice:generate",
      ]),
    );
    expect(result.unrepresentable).toEqual([]);
  });

  it("reports privileges that exceed the caretaker maximum", () => {
    expect(caretakerPrivilegeActions(["create_property", "delete_assigned_property"])).toEqual({
      actions: ["property:read", "unit:read", "assignment:read"],
      unrepresentable: ["create_property", "delete_assigned_property"],
    });
  });
});
