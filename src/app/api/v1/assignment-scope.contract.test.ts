/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { buildRequest, signToken } from "@/test/utils/api-request";
import { activeAssignment } from "@/test/utils/assignment-mocks";
import { makeObjectId, makeProperty, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Unit", () => ({ Unit: getModelStubs().unit }));
vi.mock("@/models/Block", () => ({ Block: getModelStubs().block }));
vi.mock("@/models/Lease", () => ({ Lease: getModelStubs().lease }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/ManagementAssignment", () => ({
  ManagementAssignment: getModelStubs().managementAssignment,
}));

import { GET as getInvoices } from "@/app/api/v1/invoices/route";
import { GET as getProperties } from "@/app/api/v1/properties/route";

const { user, property, invoice: invoiceStub, managementAssignment } = getModelStubs();

const ACTOR_ID = makeObjectId("staff-admin");
const PROPERTY_ID = makeObjectId("only-property");

const ASSIGNMENT = activeAssignment({
  principalUserId: ACTOR_ID,
  accessRole: "admin",
  propertyId: PROPERTY_ID,
  permissions: ["property:read", "invoice:read"],
});

describe("assignment scope contract", () => {
  it("property and invoice reads use identical assignment portfolios without legacy owner scope", async () => {
    resetModelStubs();
    user.findById.mockReturnValue(buildQuery(makeUser({ _id: ACTOR_ID, role: "admin" })));
    managementAssignment.find.mockReturnValue(buildQuery([ASSIGNMENT]));
    property.find.mockReturnValue(buildQuery([makeProperty({ _id: PROPERTY_ID })]));
    property.countDocuments.mockResolvedValue(1);
    invoiceStub.find.mockReturnValue(buildQuery([]).sort({ issuedAt: -1 }).skip(0).limit(10));
    invoiceStub.countDocuments.mockResolvedValue(0);

    const token = signToken(ACTOR_ID);

    const propertyRes = await getProperties(buildRequest("/api/v1/properties", { token }));
    expect(propertyRes.status).toBe(200);
    const propertyFilter = property.find.mock.calls[0][0] as Record<string, unknown>;

    const invoiceRes = await getInvoices(buildRequest("/api/v1/invoices", { token }));
    expect(invoiceRes.status).toBe(200);
    const invoiceFilter = invoiceStub.find.mock.calls[0][0] as Record<string, unknown>;

    expect(propertyFilter).toEqual({ _id: { $in: [PROPERTY_ID] } });
    expect(invoiceFilter).toEqual({ $or: [{ propertyId: { $in: [PROPERTY_ID] } }] });
    expect(propertyFilter).not.toHaveProperty("ownerId");
    expect(invoiceFilter).not.toHaveProperty("ownerId");
    expect(managementAssignment.find).toHaveBeenCalledWith({
      principalUserId: ACTOR_ID,
      accessRole: "admin",
      status: "active",
    });
  });
});
