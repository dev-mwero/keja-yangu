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

import { POST } from "@/app/api/v1/invoices/[id]/void/route";

const { user, property, invoice: invoiceStub } = getModelStubs();

const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const PROPERTY_ID = makeObjectId("p1");
const OTHER_PROPERTY_ID = makeObjectId("p2");
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

function pendingInvoice() {
  return makeInvoice({
    _id: INVOICE_ID,
    ownerId: OWNER_ID,
    propertyId: PROPERTY_ID,
    status: "pending",
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

describe("POST /api/v1/invoices/[id]/void", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("403 for a mismatched origin", async () => {
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
        headers: { origin: "http://evil.example" },
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
  });

  it("400 for an invalid invoice id", async () => {
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVALID_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVALID_ID),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid invoice id");
  });

  it("401 when unauthenticated", async () => {
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(401);
  });

  it("404 when the invoice is missing", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(404);
  });

  it("409 when the invoice is already paid", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "paid" })),
    );
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("Paid invoices cannot be voided");
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("voids a pending invoice with a Voided-on audit note", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice()));
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery({ ...pendingInvoice(), status: "void" }),
    );

    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const [filter, updateData] = invoiceStub.findOneAndUpdate.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(filter).toEqual({ _id: INVOICE_ID });
    expect(updateData.status).toBe("void");
    expect(updateData.notes).toMatch(/^Voided on /);
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("void");
  });

  it("voids a draft invoice", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "draft" })),
    );
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "void" })),
    );

    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
  });

  it("appends the void note to existing notes", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, notes: "first note" })),
    );
    invoiceStub.findOneAndUpdate.mockReturnValue(
      buildQuery(makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "void" })),
    );

    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    const updateData = invoiceStub.findOneAndUpdate.mock.calls[0][1] as { notes?: string };
    expect(updateData.notes).toMatch(/^first note\nVoided on /);
  });

  it("is idempotent for an already-void invoice (no write)", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    const voided = makeInvoice({ _id: INVOICE_ID, ownerId: OWNER_ID, status: "void" });
    invoiceStub.findById.mockReturnValue(buildQuery(voided));
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(OWNER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(200);
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
    const body = await json(res);
    expect((body.data as { status?: string }).status).toBe("void");
  });

  it("403 when a caretaker voids an invoice outside their assigned properties", async () => {
    user.findById.mockReturnValue(buildQuery(caretakerDoc()));
    property.find.mockReturnValue(buildQuery([{ _id: OTHER_PROPERTY_ID }]));
    invoiceStub.findById.mockReturnValue(buildQuery(pendingInvoice())); // invoice on PROPERTY_ID
    const res = await POST(
      buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
        method: "POST",
        token: signToken(CARETAKER_ID),
      }),
      withParams(INVOICE_ID),
    );
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("Forbidden");
    expect(invoiceStub.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("429 after the per-IP rate limit is exhausted", async () => {
    user.findById.mockReturnValue(buildQuery(ownerDoc()));
    invoiceStub.findById.mockReturnValue(buildQuery(null));
    let lastStatus = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        buildRequest(`/api/v1/invoices/${INVOICE_ID}/void`, {
          method: "POST",
          token: signToken(OWNER_ID),
          headers: { "x-forwarded-for": "203.0.113.14" },
        }),
        withParams(INVOICE_ID),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
