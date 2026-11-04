/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/authorization", () => ({
  loadActorContext: vi.fn(),
  evaluateActorPolicy: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ writeAuditEvent: vi.fn() }));

import { writeAuditEvent } from "@/lib/audit";
import { evaluateActorPolicy, loadActorContext } from "@/lib/authorization";
import {
  compareAuthorizationShadow,
  shadowSampleRate,
  shouldSampleShadow,
} from "@/lib/authorization-shadow";

const loadActorContextMock = vi.mocked(loadActorContext);
const evaluateMock = vi.mocked(evaluateActorPolicy);
const writeAuditMock = vi.mocked(writeAuditEvent);

const CONTEXT = {
  actor: { userId: "user-1", role: "admin" as const, isActive: true },
  assignments: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTHZ_SHADOW_SAMPLE_RATE;
});

describe("shadowSampleRate", () => {
  it("defaults to zero and clamps to one", () => {
    expect(shadowSampleRate()).toBe(0);
    process.env.AUTHZ_SHADOW_SAMPLE_RATE = "0.25";
    expect(shadowSampleRate()).toBe(0.25);
    process.env.AUTHZ_SHADOW_SAMPLE_RATE = "2";
    expect(shadowSampleRate()).toBe(1);
    process.env.AUTHZ_SHADOW_SAMPLE_RATE = "nope";
    expect(shadowSampleRate()).toBe(0);
  });
});

describe("shouldSampleShadow", () => {
  it("never samples at zero and always at one", () => {
    expect(shouldSampleShadow(0, "key")).toBe(false);
    expect(shouldSampleShadow(1, "key")).toBe(true);
  });

  it("is deterministic for a key", () => {
    expect(shouldSampleShadow(0.5, "stable-key")).toBe(shouldSampleShadow(0.5, "stable-key"));
  });
});

describe("compareAuthorizationShadow", () => {
  const input = {
    actorUserId: "user-1",
    action: "unit:read" as const,
    resource: { propertyId: "property-1" },
    legacyAllowed: true,
    rate: 1,
  };

  it("does nothing when sampling is disabled", async () => {
    await expect(compareAuthorizationShadow({ ...input, rate: 0 })).resolves.toBeNull();
    expect(loadActorContextMock).not.toHaveBeenCalled();
  });

  it("writes an audit event when the legacy and policy decisions differ", async () => {
    loadActorContextMock.mockResolvedValue(CONTEXT);
    evaluateMock.mockReturnValue({ allowed: false, reason: "no-matching-assignment" });

    const result = await compareAuthorizationShadow(input);
    expect(result).toEqual({
      legacyAllowed: true,
      policy: { allowed: false, reason: "no-matching-assignment" },
    });
    expect(writeAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { userId: "user-1", role: "admin" },
        action: "authz.shadow.mismatch",
        entityType: "AuthorizationDecision",
        entityId: "unit:read",
        before: { source: "legacy", allowed: true },
        after: {
          source: "policy",
          allowed: false,
          reason: "no-matching-assignment",
        },
      }),
    );
  });

  it("does not write an audit event when decisions agree", async () => {
    loadActorContextMock.mockResolvedValue(CONTEXT);
    evaluateMock.mockReturnValue({ allowed: true, reason: "assignment" });

    await expect(compareAuthorizationShadow(input)).resolves.toBeNull();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("skips comparison when the actor cannot be loaded", async () => {
    loadActorContextMock.mockResolvedValue(null);
    await expect(compareAuthorizationShadow(input)).resolves.toBeNull();
    expect(evaluateMock).not.toHaveBeenCalled();
  });

  it("does not fail the request when the shadow audit write fails", async () => {
    loadActorContextMock.mockResolvedValue(CONTEXT);
    evaluateMock.mockReturnValue({ allowed: false, reason: "role-maximum" });
    writeAuditMock.mockRejectedValue(new Error("audit down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(compareAuthorizationShadow(input)).resolves.toMatchObject({
      legacyAllowed: true,
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
