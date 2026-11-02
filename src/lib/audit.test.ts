/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/AuditEvent", () => ({ AuditEvent: getModelStubs().auditEvent }));

import { redactAuditValue, writeAuditEvent } from "@/lib/audit";

const { auditEvent } = getModelStubs();

describe("redactAuditValue", () => {
  it("redacts sensitive keys recursively", () => {
    const value = {
      name: "Unit 3A",
      password: "hunter2",
      nested: {
        nationalId: "12345678",
        token: "abc",
        safe: "kept",
      },
      list: [{ secret: "x", amount: 100 }],
    };

    expect(redactAuditValue(value)).toEqual({
      name: "Unit 3A",
      password: "[redacted]",
      nested: {
        nationalId: "[redacted]",
        token: "[redacted]",
        safe: "kept",
      },
      list: [{ secret: "[redacted]", amount: 100 }],
    });
  });

  it("preserves primitives and dates", () => {
    expect(redactAuditValue("text")).toBe("text");
    expect(redactAuditValue(42)).toBe(42);
    expect(redactAuditValue(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("writeAuditEvent", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("writes a redacted event with hashed request metadata", async () => {
    auditEvent.create.mockResolvedValue({});

    await writeAuditEvent({
      actor: { userId: "user-1", role: "admin" },
      action: "assignment.grant",
      entityType: "ManagementAssignment",
      entityId: "assignment-1",
      scope: { propertyId: "property-1", unitId: "unit-1" },
      before: { token: "secret", status: "pending" },
      after: { status: "active" },
      request: { requestId: "req-1", ip: "203.0.113.10", userAgent: "test-agent" },
    });

    expect(auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        actorRole: "admin",
        action: "assignment.grant",
        entityType: "ManagementAssignment",
        entityId: "assignment-1",
        scope: { propertyId: "property-1", blockId: "", unitId: "unit-1" },
        before: { token: "[redacted]", status: "pending" },
        after: { status: "active" },
        requestId: "req-1",
      }),
    );
    const created = auditEvent.create.mock.calls[0][0] as { ipHash: string; userAgentHash: string };
    expect(created.ipHash).toHaveLength(64);
    expect(created.userAgentHash).toHaveLength(64);
    expect(created.ipHash).not.toContain("203.0.113.10");
  });
});
