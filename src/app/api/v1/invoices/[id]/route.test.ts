/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, signToken, withParams } from "@/test/utils/api-request";
import { makeInvoice, makeObjectId, makeUser } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/mongoose", () => ({
  connectToDatabase: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));

import { DELETE, GET, PATCH } from "@/app/api/v1/invoices/[id]/route";

const { user, property, invoice: invoiceStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const OTHER_OWNER_ID = makeObjectId("other-owner");
const PROPERTY_ID = makeObjectId("p1");
const INVOICE_ID = makeObjectId("invoice");
const INVALID_ID = "not-an-objectid";

function ownerDoc() {
  return makeUser({ _id: OWNER_ID, role: "owner" });
}

function caretakerDoc() {
  return makeUser({
    _id: CARETAKER_ID,
    role: "caretaker",
    managedByOwnerId: OWNER_ID,
    privileges: ["manage_invoices"],
  });
}

function draftInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    status: "draft",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("GET /api/v1/invoices/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await GET(buildRequest(`/api/v1/invoices/${INVALID_ID}`), withParams(INVALID_ID));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice id");
  });

  it("401 when unauthenticated", async () => {
    const res = await GET(buildRequest(`/api/v1/invoices/${INVOICE_ID}`), withParams(INVOICE_ID));
    expect(res.status).toBe(401);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    const res = await GET(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("404 for another owner's invoice (existence hidden)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await GET(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("200 for an owner's own invoice", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(draftInvoice()));
    const res = await GET(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, { token: signToken(OWNER_ID) }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect((body.data as { ownerId?: string }).ownerId).toBe(OWNER_ID);
  });

  it("200 for an in-scope caretaker (assigned property of the managing owner)", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    invoiceStub.findById.mockReturnValue(buildQuery(draftInvoice()));
    const res = await GET(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
  });

  it("404 for a caretaker whose managing owner does not own the invoice", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID }]));
    invoiceStub.findById.mockReturnValue(
      buildQuery(
        makeInvoice({ _id: INVOICE_ID, ownerId: OTHER_OWNER_ID, propertyId: PROPERTY_ID }),
      ),
    );
    const res = await GET(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, { token: signToken(CARETAKER_ID) }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/invoices/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
        body: { notes: "x" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid id", async () => {
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVALID_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { notes: "x" },
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { notes: "x" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("403 for another owner's invoice", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OTHER_OWNER_ID })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { notes: "x" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("409 when the invoice is already paid", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "paid" })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { notes: "x" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Paid or void invoices cannot be edited");
  });

  it("409 when the invoice is void", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "void" })),
    );
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { notes: "x" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
  });

  it("400 for an invalid payload on a draft", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(draftInvoice()));
    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: { amountDue: -10 },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice payload");
  });

  it("edits a draft but strips immutable identity fields", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(draftInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...draftInvoice(), status: "pending", notes: "late fee" }),
    );

    const res = await PATCH(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "PATCH",
        token: signToken(OWNER_ID),
        body: {
          status: "pending",
          amountDue: 27000,
          notes: "late fee",
          invoiceNumber: "INV-SPOOF",
          tenantId: makeObjectId("spoof"),
          propertyId: makeObjectId("spoof"),
          leaseId: makeObjectId("spoof"),
          ownerId: OTHER_OWNER_ID,
          period: "2099-01",
        },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const [filter, updateData] = invoiceStub.findOneAndUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ _id: INVOICE_ID });
    expect(updateData).toEqual({ status: "pending", amountDue: 27000, notes: "late fee" });
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("pending");
  });
});

describe("DELETE /api/v1/invoices/[id]", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("400 for an invalid id", async () => {
    const res = await DELETE(
      buildRequest(`/api/v1/invoices/${INVALID_ID}`, { method: "DELETE" }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
  });

  it("404 when absent", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    const res = await DELETE(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("409 for a non-draft invoice", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "pending" })),
    );
    const res = await DELETE(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Only draft invoices can be deleted");
    expect(invoiceStub.deleteOne).not.toHaveBeenCalled();
  });

  it("200 and deletes a draft invoice", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(draftInvoice()));
    invoiceStub.deleteOne.mockResolvedValue({ deletedCount: 1 });

    const res = await DELETE(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
        method: "DELETE",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    expect(invoiceStub.deleteOne).toHaveBeenCalledWith({ _id: INVOICE_ID });
    const body = await json(res);
    expect(body.message).toBe("Invoice deleted");
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await DELETE(
        buildRequest(`/api/v1/invoices/${INVOICE_ID}`, {
          method: "DELETE",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.18" },
        }),
        withParams(INVOICE_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
