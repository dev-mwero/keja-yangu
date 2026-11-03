/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest } from "@/test/utils/api-request";

const { recordProvisionalTouchMock } = vi.hoisted(() => ({
  recordProvisionalTouchMock: vi.fn(),
}));

vi.mock("@/lib/attributions", () => ({
  recordProvisionalTouch: recordProvisionalTouchMock,
}));

import { POST } from "@/app/api/v1/attribution/touch/route";

describe("POST /api/v1/attribution/touch", () => {
  beforeEach(() => {
    recordProvisionalTouchMock.mockReset();
  });

  it("returns 400 for an invalid payload", async () => {
    const res = await POST(
      buildRequest("/api/v1/attribution/touch", { method: "POST", body: { shareCode: "" } }),
    );
    expect(res.status).toBe(400);
    expect(recordProvisionalTouchMock).not.toHaveBeenCalled();
  });

  it("returns the validated touch without leaking publisher PII", async () => {
    recordProvisionalTouchMock.mockResolvedValue({
      valid: true,
      source: "broker",
      brokerUserId: "broker-1",
      listing: { _id: "listing-1", propertyId: "prop-1" },
      publisher: { _id: "pub-1", publisherUserId: "broker-1", phone: "+254700000000" },
    });

    const res = await POST(
      buildRequest("/api/v1/attribution/touch", {
        method: "POST",
        body: { shareCode: "brk_abc123", unitId: "unit-1" },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toMatchObject({
      valid: true,
      source: "broker",
      brokerUserId: "broker-1",
      listingId: "listing-1",
      propertyId: "prop-1",
    });
    expect(json.data.publisher).toBeUndefined();
  });

  it("returns an invalid result for an inactive share code", async () => {
    recordProvisionalTouchMock.mockResolvedValue({
      valid: false,
      reason: "Share code is invalid or inactive",
      source: "direct",
    });

    const res = await POST(
      buildRequest("/api/v1/attribution/touch", {
        method: "POST",
        body: { shareCode: "brk_missing", unitId: "unit-1" },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.valid).toBe(false);
    expect(json.data.reason).toContain("invalid or inactive");
  });
});
