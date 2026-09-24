import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tenant } from "@/hooks/use-tenants";
import { useTenantMutations, useTenants } from "@/hooks/use-tenants";

const tenant: Tenant = {
  _id: "ten-1",
  name: "Amina Otieno",
  email: "amina@keja.co",
  propertyId: "prop-1",
  ownerId: "owner-1",
  status: "active",
};

function stubFetch(result: { ok?: boolean; json?: unknown; error?: unknown }) {
  const json = vi.fn();
  if (result.error) {
    json.mockRejectedValue(result.error);
  } else {
    json.mockResolvedValue(result.json);
  }
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: result.ok ?? true, status: result.ok === false ? 409 : 201, json }),
  );
}

describe("useTenants", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the tenant list from GET /api/v1/tenants", async () => {
    stubFetch({ json: { data: [tenant] } });
    const { result } = renderHook(() => useTenants());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tenants).toEqual([tenant]);
    expect(result.current.error).toBeNull();
  });

  it("appends status and propertyId filters to the query string", async () => {
    stubFetch({ json: { data: [] } });
    renderHook(() => useTenants({ status: "active", propertyId: "prop-1" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/v1/tenants?status=active&propertyId=prop-1"),
    );
  });

  it("surfaces an API error message", async () => {
    stubFetch({ ok: false, json: { error: "Forbidden" } });
    const { result } = renderHook(() => useTenants());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Forbidden");
    expect(result.current.tenants).toEqual([]);
  });

  it("surfaces a network failure", async () => {
    stubFetch({ error: new Error("Network error") });
    const { result } = renderHook(() => useTenants());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
  });
});

describe("useTenantMutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a tenant via POST /api/v1/tenants", async () => {
    stubFetch({ json: { data: tenant } });
    const { result } = renderHook(() => useTenantMutations());

    await act(async () => {
      const created = await result.current.createTenant({
        name: "Amina Otieno",
        email: "amina@keja.co",
        propertyId: "prop-1",
      });
      expect(created).toEqual(tenant);
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/tenants",
      expect.objectContaining({ method: "POST", body: expect.any(String) }),
    );
  });

  it("updates a tenant via PATCH /api/v1/tenants/:id", async () => {
    stubFetch({ json: { data: tenant } });
    const { result } = renderHook(() => useTenantMutations());

    await act(async () => {
      const updated = await result.current.updateTenant("ten-1", { name: "Amina Wanjiru" });
      expect(updated).toEqual(tenant);
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/tenants/ten-1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("throws the API error when a create is rejected", async () => {
    stubFetch({ ok: false, json: { error: "Duplicate tenant" } });
    const { result } = renderHook(() => useTenantMutations());

    await expect(
      result.current.createTenant({ name: "A", email: "a@keja.co", propertyId: "prop-1" }),
    ).rejects.toThrow("Duplicate tenant");
  });

  it("deletes a tenant via DELETE /api/v1/tenants/:id", async () => {
    stubFetch({ json: { message: "Tenant deleted" } });
    const { result } = renderHook(() => useTenantMutations());

    await act(async () => {
      await result.current.deleteTenant("ten-1");
    });
    expect(fetch).toHaveBeenCalledWith("/api/v1/tenants/ten-1", { method: "DELETE" });
  });
});
