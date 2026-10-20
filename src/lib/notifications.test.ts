/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createComplaintStatusContent,
  createInvoicePaidContent,
  createLeaseExpiryContent,
  createOverdueContent,
  isEmailConfigured,
  sendNotificationEmail,
} from "@/lib/email";
import { makeObjectId } from "@/test/utils/factories";
import { buildQuery, getModelStubs, resetModelStubs } from "@/test/utils/model-mocks";

vi.mock("@/lib/email", () => ({
  isEmailConfigured: vi.fn(),
  sendNotificationEmail: vi.fn(),
  createInvoicePaidContent: vi.fn(),
  createInvoicePaidStaffContent: vi.fn(),
  createOverdueContent: vi.fn(),
  createLeaseExpiryContent: vi.fn(),
  createComplaintStatusContent: vi.fn(),
  createAnnouncementContent: vi.fn(),
  sanitizeHeader: vi.fn(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: mirrors the real helper this module composes subjects through.
    (value: string) => value.replace(/[\r\n\u0000-\u001f]/g, " "),
  ),
}));
vi.mock("@/models/User", () => ({ User: getModelStubs().user }));
vi.mock("@/models/Tenant", () => ({ Tenant: getModelStubs().tenant }));
vi.mock("@/models/Property", () => ({ Property: getModelStubs().property }));
vi.mock("@/models/Invoice", () => ({ Invoice: getModelStubs().invoice }));
vi.mock("@/models/Notification", () => ({ Notification: getModelStubs().notification }));

import {
  notifyAnnouncement,
  notifyComplaintCreated,
  notifyComplaintStatusChange,
  notifyInvoiceOverdue,
  notifyInvoicePaid,
  notifyLeaseExpiry,
  notifyMessageReply,
  notifyMoveRequestCreated,
  notifyMoveRequestDecided,
  notifyOverdueInvoices,
  notifyUser,
  resolveAnnouncementRecipients,
  resolveStaffRecipients,
  wantsEmailNotifications,
} from "@/lib/notifications";

const { user, tenant, property, invoice, notification } = getModelStubs();
const isEmailConfiguredMock = vi.mocked(isEmailConfigured);
const sendNotificationEmailMock = vi.mocked(sendNotificationEmail);
const createInvoicePaidContentMock = vi.mocked(createInvoicePaidContent);
const createOverdueContentMock = vi.mocked(createOverdueContent);
const createLeaseExpiryContentMock = vi.mocked(createLeaseExpiryContent);
const createComplaintStatusContentMock = vi.mocked(createComplaintStatusContent);

const USER_ID = makeObjectId("user");
const OWNER_ID = makeObjectId("owner");
const CARETAKER_ID = makeObjectId("caretaker");
const TENANT_ID = makeObjectId("tenant");
const PROPERTY_ID = makeObjectId("prop");
const INVOICE_ID = makeObjectId("invoice");
const LEASE_ID = makeObjectId("lease");
const COMPLAINT_ID = makeObjectId("complaint");
const CUSTODIAN_ID = makeObjectId("custodian");
const MOVE_REQUEST_ID = makeObjectId("moverequest");

describe("notifyUser", () => {
  beforeEach(() => {
    resetModelStubs();
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    sendNotificationEmailMock.mockReset().mockResolvedValue(false);
    createInvoicePaidContentMock.mockReset().mockReturnValue("");
    createOverdueContentMock.mockReset().mockReturnValue("");
    createLeaseExpiryContentMock.mockReset().mockReturnValue("");
    createComplaintStatusContentMock.mockReset().mockReturnValue("");
  });

  it("persists one row with the typed dedupe key", async () => {
    notification.create.mockResolvedValue({ _id: "n1" });
    const ok = await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
      data: { invoiceId: INVOICE_ID },
      link: "/dashboard/tenant/payments",
    });
    expect(ok).toBe(true);
    const doc = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.recipientUserId).toBe(USER_ID);
    expect(doc.type).toBe("invoice:paid");
    expect(doc.data).toEqual({ invoiceId: INVOICE_ID });
    expect(doc.dedupeKey).toBe(`invoice:paid:${INVOICE_ID}`);
    expect(doc.channels).toEqual(["in-app"]);
    expect(doc.link).toBe("/dashboard/tenant/payments");
  });

  it("leaves dedupeKey empty when the event carries no resolvable id", async () => {
    notification.create.mockResolvedValue({ _id: "n1" });
    await notifyUser(USER_ID, {
      type: "announcement",
      title: "Notice",
      body: "Water works scheduled.",
      data: { building: "block-a" },
    });
    const doc = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.dedupeKey).toBe("");
  });

  it("honours an explicit eventId over the embedded event ids", async () => {
    notification.create.mockResolvedValue({ _id: "n1" });
    await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
      data: { eventId: "custom-123", invoiceId: INVOICE_ID },
    });
    const doc = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.dedupeKey).toBe(`invoice:paid:custom-123`);
  });

  it("treats an E11000 duplicate as a silent success", async () => {
    notification.create.mockRejectedValue({ code: 11000 });
    const ok = await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
      data: { invoiceId: INVOICE_ID },
      channels: ["in-app", "email"],
      email: {
        subjectPrefix: "x",
        content: "",
        text: "",
        linkUrl: "",
        preheader: "",
      },
    });
    expect(ok).toBe(true);
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
    expect(notification.updateOne).not.toHaveBeenCalled();
  });

  it("sends email when configured and subscribed, stamping emailSentAt", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    notification.create.mockResolvedValue({ _id: "n1" });
    notification.updateOne.mockResolvedValue({ modifiedCount: 1 });
    isEmailConfiguredMock.mockReturnValue(true);
    sendNotificationEmailMock.mockResolvedValue(true);

    const ok = await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
      data: { invoiceId: INVOICE_ID },
      channels: ["in-app", "email"],
      email: {
        subjectPrefix: "Invoice paid",
        content: "c",
        text: "t",
        linkUrl: "http://localhost:3000/x",
        preheader: "p",
      },
    });
    expect(ok).toBe(true);
    expect(sendNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "t@keja.co", subjectPrefix: "Invoice paid" }),
    );
    expect(notification.updateOne).toHaveBeenCalledWith(
      { _id: "n1", emailSentAt: null },
      { $set: { emailSentAt: expect.any(Date) } },
    );
  });

  it("skips email when SMTP is not configured", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    notification.create.mockResolvedValue({ _id: "n1" });
    isEmailConfiguredMock.mockReturnValue(false);

    await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
      data: { invoiceId: INVOICE_ID },
      channels: ["in-app", "email"],
      email: {
        subjectPrefix: "x",
        content: "",
        text: "",
        linkUrl: "",
        preheader: "",
      },
    });
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
    expect(notification.updateOne).not.toHaveBeenCalled();
  });

  it("skips email when the user opted out of email notifications", async () => {
    user.findById.mockReturnValue(
      buildQuery({ _id: USER_ID, settings: { emailNotifications: false } }),
    );
    notification.create.mockResolvedValue({ _id: "n1" });
    isEmailConfiguredMock.mockReturnValue(true);

    await notifyUser(USER_ID, {
      type: "invoice:overdue",
      title: "Invoice overdue",
      body: "Please pay.",
      data: { invoiceId: INVOICE_ID },
      channels: ["in-app", "email"],
      email: {
        subjectPrefix: "x",
        content: "",
        text: "",
        linkUrl: "",
        preheader: "",
      },
    });
    expect(sendNotificationEmailMock).not.toHaveBeenCalled();
  });

  it("never throws on a non-duplicate persist failure and returns false", async () => {
    notification.create.mockRejectedValue(new Error("db exploded"));
    const ok = await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
    });
    expect(ok).toBe(false);
  });

  it("never throws when the user lookup itself fails", async () => {
    user.findById.mockRejectedValue(new Error("db down"));
    notification.create.mockResolvedValue({ _id: "n1" });
    const ok = await notifyUser(USER_ID, {
      type: "invoice:paid",
      title: "Invoice paid",
      body: "Payment received.",
    });
    expect(ok).toBe(true);
  });
});

describe("wantsEmailNotifications", () => {
  it("returns the stored preference", async () => {
    user.findById.mockReturnValue(
      buildQuery({ _id: USER_ID, settings: { emailNotifications: false } }),
    );
    await expect(wantsEmailNotifications(USER_ID)).resolves.toBe(false);
  });

  it("defaults to enabled when settings are missing", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID }));
    await expect(wantsEmailNotifications(USER_ID)).resolves.toBe(true);
  });

  it("defaults to enabled when the lookup fails", async () => {
    user.findById.mockRejectedValue(new Error("db down"));
    await expect(wantsEmailNotifications(USER_ID)).resolves.toBe(true);
  });
});

describe("notifyInvoicePaid", () => {
  beforeEach(() => {
    resetModelStubs();
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    sendNotificationEmailMock.mockReset().mockResolvedValue(false);
    createInvoicePaidContentMock.mockReset().mockReturnValue("<p>paid</p>");
    notification.create.mockResolvedValue({ _id: "n1" });
  });

  it("fans out to tenant (email), owner and caretakers with role-aware links", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );

    const ok = await notifyInvoicePaid({
      _id: INVOICE_ID,
      invoiceNumber: "INV-202609-0001",
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      period: "2026-09",
      amountDue: 25000,
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(3);
    expect(tenant.findById).toHaveBeenCalledWith(TENANT_ID);
    expect(property.findById).toHaveBeenCalledWith(PROPERTY_ID);

    const tenantRow = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(tenantRow.recipientUserId).toBe(USER_ID);
    expect(tenantRow.type).toBe("invoice:paid");
    expect(tenantRow.channels).toEqual(["in-app", "email"]);
    expect(tenantRow.link).toBe("/dashboard/tenant/payments");
    expect(tenantRow.dedupeKey).toBe(`invoice:paid:${INVOICE_ID}`);

    const ownerRow = notification.create.mock.calls[1][0] as Record<string, unknown>;
    expect(ownerRow.recipientUserId).toBe(OWNER_ID);
    expect(ownerRow.channels).toEqual(["in-app"]);
    expect(ownerRow.link).toBe("/dashboard/owner/accounting");

    const caretakerRow = notification.create.mock.calls[2][0] as Record<string, unknown>;
    expect(caretakerRow.recipientUserId).toBe(CARETAKER_ID);
    expect(caretakerRow.link).toBe("/dashboard/caretaker/accounting");
  });

  it("also notifies the owner's custodians", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));

    const ok = await notifyInvoicePaid({
      _id: INVOICE_ID,
      invoiceNumber: "INV-202609-0001",
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      period: "2026-09",
      amountDue: 25000,
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(4);
    const custodianRow = notification.create.mock.calls[3][0] as Record<string, unknown>;
    expect(custodianRow.recipientUserId).toBe(CUSTODIAN_ID);
    expect(custodianRow.type).toBe("invoice:paid");
    expect(custodianRow.channels).toEqual(["in-app"]);
    expect(custodianRow.link).toBe("/dashboard/custodian/accounting");
    expect(custodianRow.dedupeKey).toBe(`invoice:paid:${INVOICE_ID}`);
  });

  it("skips the tenant branch when the tenant row has no userId", async () => {
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: "" }));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, caretakerIds: [] }));

    const ok = await notifyInvoicePaid({
      _id: INVOICE_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      period: "2026-09",
      amountDue: 25000,
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(1);
    expect(
      (notification.create.mock.calls[0][0] as { recipientUserId: string }).recipientUserId,
    ).toBe(OWNER_ID);
  });

  it("does not throw when the tenant row is missing entirely", async () => {
    tenant.findById.mockReturnValue(buildQuery(null));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, caretakerIds: [] }));

    const ok = await notifyInvoicePaid({
      _id: INVOICE_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      period: "2026-09",
      amountDue: 25000,
    });
    expect(ok).toBe(true);
  });
});

describe("notifyInvoiceOverdue & notifyOverdueInvoices", () => {
  beforeEach(() => {
    resetModelStubs();
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    createOverdueContentMock.mockReset().mockReturnValue("<p>overdue</p>");
  });

  it("sends the tenant an email channel and staff in-app rows", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, caretakerIds: [] }));
    notification.create.mockResolvedValue({ _id: "n1" });

    await notifyInvoiceOverdue({
      _id: INVOICE_ID,
      invoiceNumber: "INV-202609-0001",
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      period: "2026-09",
      amountDue: 25000,
    });
    const tenantRow = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(tenantRow.dedupeKey).toBe(`invoice:overdue:${INVOICE_ID}`);
    expect(tenantRow.channels).toEqual(["in-app", "email"]);
    expect(createOverdueContentMock).toHaveBeenCalledWith(
      expect.objectContaining({ amountDue: 25000, period: "2026-09" }),
    );
  });

  it("sweeps pending-and-due invoices with the scope spread over the filter", async () => {
    const overdue = {
      _id: INVOICE_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      ownerId: OWNER_ID,
      period: "2026-09",
      amountDue: 25000,
      status: "pending",
    };
    invoice.find.mockReturnValue(buildQuery([overdue]).sort({ dueDate: 1 }).limit(200));
    notification.create.mockResolvedValue({ _id: "n1" });

    const ok = await notifyOverdueInvoices(new Date("2026-09-20T00:00:00.000Z"), {
      ownerId: OWNER_ID,
    });
    expect(ok).toBe(true);
    expect(invoice.find).toHaveBeenCalledWith({
      status: "pending",
      dueDate: { $lt: new Date("2026-09-20T00:00:00.000Z") },
      ownerId: OWNER_ID,
    });
    expect(notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "invoice:overdue",
        dedupeKey: `invoice:overdue:${INVOICE_ID}`,
      }),
    );
  });

  it("never throws when the sweep query fails", async () => {
    invoice.find.mockRejectedValue(new Error("db exploded"));
    await expect(notifyOverdueInvoices()).resolves.toBe(false);
  });
});

describe("notifyLeaseExpiry", () => {
  beforeEach(() => {
    resetModelStubs();
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    createLeaseExpiryContentMock.mockReset().mockReturnValue("<p>lease</p>");
    notification.create.mockResolvedValue({ _id: "n1" });
  });

  it("emails tenant and owner, keeping caretakers in-app", async () => {
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );

    const ok = await notifyLeaseExpiry(
      {
        _id: LEASE_ID,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_ID,
        rentAmount: 25000,
        endDate: new Date("2026-10-01T00:00:00.000Z"),
      },
      7,
    );
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(3);
    const tenantRow = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(tenantRow.dedupeKey).toBe(`lease:expiring:${LEASE_ID}`);
    expect(tenantRow.channels).toEqual(["in-app", "email"]);
    const ownerRow = notification.create.mock.calls[1][0] as Record<string, unknown>;
    expect(ownerRow.channels).toEqual(["in-app", "email"]);
    const caretakerRow = notification.create.mock.calls[2][0] as Record<string, unknown>;
    expect(caretakerRow.channels).toEqual(["in-app"]);
  });

  it("also notifies the owner's custodians", async () => {
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));

    const ok = await notifyLeaseExpiry(
      {
        _id: LEASE_ID,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        ownerId: OWNER_ID,
        rentAmount: 25000,
        endDate: new Date("2026-10-01T00:00:00.000Z"),
      },
      7,
    );
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(4);
    const custodianRow = notification.create.mock.calls[3][0] as Record<string, unknown>;
    expect(custodianRow.recipientUserId).toBe(CUSTODIAN_ID);
    expect(custodianRow.type).toBe("lease:expiring");
    expect(custodianRow.link).toBe("/dashboard/custodian/accounting");
    expect(custodianRow.dedupeKey).toBe(`lease:expiring:${LEASE_ID}`);
  });
});

describe("complaint, message and announcement seams", () => {
  beforeEach(() => {
    resetModelStubs();
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    createComplaintStatusContentMock.mockReset().mockReturnValue("<p>status</p>");
    notification.create.mockResolvedValue({ _id: "n1" });
  });

  it("notifies complaint-created to the property owner, custodians and caretakers", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));
    const ok = await notifyComplaintCreated({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      subject: "Leaking tap",
      priority: "high",
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(3);
    const ownerRow = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(ownerRow.recipientUserId).toBe(OWNER_ID);
    expect(ownerRow.link).toBe("/dashboard/owner/communications");
    const custodianRow = notification.create.mock.calls[1][0] as Record<string, unknown>;
    expect(custodianRow.recipientUserId).toBe(CUSTODIAN_ID);
    expect(custodianRow.link).toBe("/dashboard/custodian/communications");
    const caretakerRow = notification.create.mock.calls[2][0] as Record<string, unknown>;
    expect(caretakerRow.recipientUserId).toBe(CARETAKER_ID);
    expect(caretakerRow.link).toBe("/dashboard/caretaker/communications");
    expect(ownerRow.dedupeKey).toBe(`complaint:created:${COMPLAINT_ID}`);
    expect(ownerRow.type).toBe("complaint:created");
  });

  it("notifies complaint-created to staff only (no caretakers)", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));
    await notifyComplaintCreated({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      subject: "Leaking tap",
    });
    expect(notification.create).toHaveBeenCalledTimes(2);
    expect((notification.create.mock.calls[0][0] as Record<string, unknown>).recipientUserId).toBe(
      OWNER_ID,
    );
    expect((notification.create.mock.calls[1][0] as Record<string, unknown>).recipientUserId).toBe(
      CUSTODIAN_ID,
    );
  });

  it("returns false when the complaint property lookup fails", async () => {
    property.findById.mockReturnValue(buildQuery(null));
    await expect(
      notifyComplaintCreated({
        _id: COMPLAINT_ID,
        tenantId: TENANT_ID,
        propertyId: PROPERTY_ID,
        subject: "Leaking tap",
      }),
    ).resolves.toBe(false);
  });

  it("notifies complaint status changes to the tenant, keyed per status", async () => {
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    const ok = await notifyComplaintStatusChange({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      subject: "Leaking tap",
      status: "resolved",
    });
    expect(ok).toBe(true);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.type).toBe("complaint:status-changed");
    expect(row.dedupeKey).toBe(`complaint:status-changed:${COMPLAINT_ID}:resolved`);
    expect(row.channels).toEqual(["in-app", "email"]);
    expect(createComplaintStatusContentMock).toHaveBeenCalledWith({
      subject: "Leaking tap",
      status: "resolved",
    });
  });

  it("strips CR/LF from the complaint subject in the email subject line", async () => {
    tenant.findById.mockReturnValue(buildQuery({ _id: TENANT_ID, userId: USER_ID }));
    user.findById.mockReturnValue(buildQuery({ _id: USER_ID, role: "tenant", email: "t@keja.co" }));
    notification.create.mockResolvedValue({ _id: "n1" });
    notification.updateOne.mockResolvedValue({ modifiedCount: 1 });
    isEmailConfiguredMock.mockReturnValue(true);
    sendNotificationEmailMock.mockResolvedValue(true);
    createComplaintStatusContentMock.mockReturnValue("<p>status</p>");

    const ok = await notifyComplaintStatusChange({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      subject: "Leak\r\nX-Injected: yes",
      status: "resolved",
    });
    expect(ok).toBe(true);
    expect(sendNotificationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectPrefix: 'Complaint "Leak  X-Injected: yes" resolved - Keja Yangu',
      }),
    );
  });

  it("message replies reach the non-sender only", async () => {
    const ok = await notifyMessageReply(
      { _id: makeObjectId("msg"), threadId: "t1", senderUserId: USER_ID, text: "hello" },
      OWNER_ID,
    );
    expect(ok).toBe(true);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.recipientUserId).toBe(OWNER_ID);
    expect(row.type).toBe("chat:reply");
    expect(row.channels).toEqual(["in-app"]);
    expect((row.data as { threadId: string }).threadId).toBe("t1");
  });

  it("message replies skip the sender themselves", async () => {
    const ok = await notifyMessageReply(
      { _id: makeObjectId("msg"), threadId: "t1", senderUserId: USER_ID, text: "hello" },
      USER_ID,
    );
    expect(ok).toBe(true);
    expect(notification.create).not.toHaveBeenCalled();
  });

  it("message replies use the caller-supplied link", async () => {
    const ok = await notifyMessageReply(
      { _id: makeObjectId("msg"), threadId: "t1", senderUserId: USER_ID, text: "hello" },
      OWNER_ID,
      "/dashboard/caretaker/communications",
    );
    expect(ok).toBe(true);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.recipientUserId).toBe(OWNER_ID);
    expect(row.link).toBe("/dashboard/caretaker/communications");
  });

  it("announcements fan out to each audience member with role-aware links", async () => {
    user.find.mockReturnValue(
      buildQuery([
        { _id: USER_ID, role: "tenant" },
        { _id: OWNER_ID, role: "owner" },
      ]),
    );
    const ok = await notifyAnnouncement(
      { _id: makeObjectId("ann"), title: "Water works", body: "Sunday 9am" },
      [USER_ID, OWNER_ID],
    );
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(2);
    const tenantRow = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(tenantRow.recipientUserId).toBe(USER_ID);
    expect(tenantRow.link).toBe("/dashboard/tenant/messages");
    const ownerRow = notification.create.mock.calls[1][0] as Record<string, unknown>;
    expect(ownerRow.recipientUserId).toBe(OWNER_ID);
    expect(ownerRow.link).toBe("/dashboard/owner/communications");
    expect(tenantRow.dedupeKey).toBe(`announcement:${makeObjectId("ann")}`);
  });
});

describe("resolveStaffRecipients", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("resolves the owner, custodians and the property's caretakers", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));

    const staff = await resolveStaffRecipients({
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
    });

    expect(staff).toEqual([
      { userId: OWNER_ID, role: "owner" },
      { userId: CUSTODIAN_ID, role: "custodian" },
      { userId: CARETAKER_ID, role: "caretaker" },
    ]);
    expect(property.findById).toHaveBeenCalledWith(PROPERTY_ID);
  });

  it("resolves portfolio-wide caretakers when propertyId is omitted", async () => {
    property.find.mockReturnValue(buildQuery([{ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }]));
    user.find.mockReturnValue(buildQuery([]));

    const staff = await resolveStaffRecipients({ ownerId: OWNER_ID });

    expect(staff).toEqual([
      { userId: OWNER_ID, role: "owner" },
      { userId: CARETAKER_ID, role: "caretaker" },
    ]);
    expect(property.find).toHaveBeenCalledWith({ ownerId: OWNER_ID });
  });

  it("deduplicates the owner when they also appear as a caretaker", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [OWNER_ID, CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([]));

    const staff = await resolveStaffRecipients({ ownerId: OWNER_ID, propertyId: PROPERTY_ID });

    expect(staff).toEqual([
      { userId: OWNER_ID, role: "owner" },
      { userId: CARETAKER_ID, role: "caretaker" },
    ]);
  });

  it("returns an empty list for an empty ownerId without touching the database", async () => {
    const staff = await resolveStaffRecipients({ ownerId: "" });
    expect(staff).toEqual([]);
    expect(user.find).not.toHaveBeenCalled();
    expect(property.find).not.toHaveBeenCalled();
    expect(property.findById).not.toHaveBeenCalled();
  });

  it("keeps the owner even when custodian/caretaker lookups fail", async () => {
    user.find.mockRejectedValue(new Error("db down"));
    property.findById.mockRejectedValue(new Error("db down"));

    const staff = await resolveStaffRecipients({ ownerId: OWNER_ID, propertyId: PROPERTY_ID });

    expect(staff).toEqual([{ userId: OWNER_ID, role: "owner" }]);
  });
});

describe("resolveAnnouncementRecipients", () => {
  beforeEach(() => {
    resetModelStubs();
  });

  it("audience tenants returns only claimed tenants of the owner", async () => {
    tenant.find.mockReturnValue(
      buildQuery([
        { _id: TENANT_ID, userId: USER_ID },
        { _id: "t2", userId: "" },
      ]),
    );

    const recipients = await resolveAnnouncementRecipients({
      ownerId: OWNER_ID,
      propertyId: "",
      audience: "tenants",
      authorId: "author",
    });

    expect(recipients).toEqual([USER_ID]);
    expect(tenant.find).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: OWNER_ID,
        deletedAt: null,
        userId: { $ne: "" },
      }),
    );
  });

  it("scopes property-scoped announcements to that property's tenants", async () => {
    tenant.find.mockReturnValue(buildQuery([{ _id: TENANT_ID, userId: USER_ID }]));

    await resolveAnnouncementRecipients({
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      audience: "tenants",
      authorId: "author",
    });

    expect(tenant.find).toHaveBeenCalledWith(expect.objectContaining({ propertyId: PROPERTY_ID }));
  });

  it("audience staff returns owner, custodians and caretakers", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));

    const recipients = await resolveAnnouncementRecipients({
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      audience: "staff",
      authorId: "author",
    });

    expect(recipients).toEqual([OWNER_ID, CUSTODIAN_ID, CARETAKER_ID]);
  });

  it("audience all merges both sides and excludes the author", async () => {
    tenant.find.mockReturnValue(buildQuery([{ _id: TENANT_ID, userId: USER_ID }]));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, caretakerIds: [] }));
    user.find.mockReturnValue(buildQuery([]));

    const recipients = await resolveAnnouncementRecipients({
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      audience: "all",
      authorId: USER_ID,
    });

    // The tenant row is excluded (author); only the owner remains.
    expect(recipients).toEqual([OWNER_ID]);
  });

  it("returns an empty list on failure", async () => {
    tenant.find.mockRejectedValue(new Error("db down"));
    await expect(
      resolveAnnouncementRecipients({
        ownerId: OWNER_ID,
        propertyId: "",
        audience: "tenants",
        authorId: "author",
      }),
    ).resolves.toEqual([]);
  });
});

describe("notifyMoveRequestCreated", () => {
  beforeEach(() => {
    resetModelStubs();
    notification.create.mockResolvedValue({ _id: "n1" });
  });

  it("fans out to staff minus the requester with move-request links", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([{ _id: CUSTODIAN_ID, role: "custodian" }]));

    const ok = await notifyMoveRequestCreated({
      _id: MOVE_REQUEST_ID,
      type: "move-in",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: CARETAKER_ID,
      requestedByRole: "caretaker",
      requestedFor: "2026-11-01",
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(2);

    const ownerRow = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(ownerRow.recipientUserId).toBe(OWNER_ID);
    expect(ownerRow.type).toBe("move-request:created");
    expect(ownerRow.link).toBe("/dashboard/owner/move-requests");
    expect(ownerRow.dedupeKey).toBe(`move-request:created:${MOVE_REQUEST_ID}`);
    expect(ownerRow.data).toEqual({ moveRequestId: MOVE_REQUEST_ID, propertyId: PROPERTY_ID });
    expect(ownerRow.body).toContain("2026-11-01");

    const custodianRow = notification.create.mock.calls[1][0] as Record<string, unknown>;
    expect(custodianRow.link).toBe("/dashboard/custodian/move-requests");
  });

  it("skips the requester when they are the owner", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, caretakerIds: [CARETAKER_ID] }),
    );
    user.find.mockReturnValue(buildQuery([]));

    await notifyMoveRequestCreated({
      _id: MOVE_REQUEST_ID,
      type: "move-out",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: OWNER_ID,
      requestedByRole: "owner",
    });
    expect(notification.create).toHaveBeenCalledTimes(1);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.recipientUserId).toBe(CARETAKER_ID);
    expect(row.link).toBe("/dashboard/caretaker/move-requests");
  });
});

describe("notifyMoveRequestDecided", () => {
  beforeEach(() => {
    resetModelStubs();
    notification.create.mockResolvedValue({ _id: "n1" });
  });

  it("notifies the requester of the decision with the decision note", async () => {
    const ok = await notifyMoveRequestDecided({
      _id: MOVE_REQUEST_ID,
      type: "move-in",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: USER_ID,
      requestedByRole: "tenant",
      status: "approved",
      decidedById: OWNER_ID,
      decisionNote: "Unit B2 is ready.",
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(1);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.recipientUserId).toBe(USER_ID);
    expect(row.type).toBe("move-request:decided");
    expect(row.title).toBe("Move request approved");
    expect(row.body).toContain("Unit B2 is ready.");
    expect(row.link).toBe("/dashboard/tenant/requests");
    expect(row.dedupeKey).toBe(`move-request:decided:${MOVE_REQUEST_ID}:approved`);
  });

  it("does not notify the decider of their own decision", async () => {
    await notifyMoveRequestDecided({
      _id: MOVE_REQUEST_ID,
      type: "move-out",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: OWNER_ID,
      requestedByRole: "owner",
      status: "approved",
      decidedById: OWNER_ID,
    });
    expect(notification.create).not.toHaveBeenCalled();
  });

  it("skips when the requester is unknown", async () => {
    await notifyMoveRequestDecided({
      _id: MOVE_REQUEST_ID,
      type: "move-in",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: "",
      requestedByRole: "tenant",
      status: "approved",
      decidedById: OWNER_ID,
    });
    expect(notification.create).not.toHaveBeenCalled();
  });

  it("notifies again when a request is re-decided to a different status", async () => {
    user.find.mockReturnValue(buildQuery([]));
    property.findById.mockReturnValue(buildQuery({ _id: PROPERTY_ID, caretakerIds: [] }));

    const base = {
      _id: MOVE_REQUEST_ID,
      type: "move-in",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: USER_ID,
      requestedByRole: "caretaker",
      decidedById: OWNER_ID,
    };
    await notifyMoveRequestDecided({ ...base, status: "approved" });
    await notifyMoveRequestDecided({ ...base, status: "rejected" });

    expect(notification.create).toHaveBeenCalledTimes(2);
    const rows = notification.create.mock.calls.map((call) => call[0] as { dedupeKey?: string });
    expect(rows[0].dedupeKey).toBe(`move-request:decided:${MOVE_REQUEST_ID}:approved`);
    expect(rows[1].dedupeKey).toBe(`move-request:decided:${MOVE_REQUEST_ID}:rejected`);
  });

  it("falls back to /dashboard/system-admin for system-admin requesters", async () => {
    await notifyMoveRequestDecided({
      _id: MOVE_REQUEST_ID,
      type: "move-in",
      ownerId: OWNER_ID,
      propertyId: PROPERTY_ID,
      requestedById: USER_ID,
      requestedByRole: "system-admin",
      status: "rejected",
      decidedById: OWNER_ID,
    });
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.link).toBe("/dashboard/system-admin");
  });
});
