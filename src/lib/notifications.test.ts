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
  notifyOverdueInvoices,
  notifyUser,
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
});

describe("complaint, message and announcement seams", () => {
  beforeEach(() => {
    resetModelStubs();
    isEmailConfiguredMock.mockReset().mockReturnValue(false);
    createComplaintStatusContentMock.mockReset().mockReturnValue("<p>status</p>");
    notification.create.mockResolvedValue({ _id: "n1" });
  });

  it("notifies complaint-created to the property owner and caretakers", async () => {
    property.findById.mockReturnValue(
      buildQuery({ _id: PROPERTY_ID, ownerId: OWNER_ID, caretakerIds: [CARETAKER_ID] }),
    );
    const ok = await notifyComplaintCreated({
      _id: COMPLAINT_ID,
      tenantId: TENANT_ID,
      propertyId: PROPERTY_ID,
      subject: "Leaking tap",
      priority: "high",
    });
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(2);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.dedupeKey).toBe(`complaint:created:${COMPLAINT_ID}`);
    expect(row.type).toBe("complaint:created");
    expect(row.link).toBe("/dashboard/owner/communications");
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

  it("notifies complaint status changes to the tenant", async () => {
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
    expect(row.dedupeKey).toBe(`complaint:status-changed:${COMPLAINT_ID}`);
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

  it("announcements fan out to each audience member", async () => {
    const ok = await notifyAnnouncement(
      { _id: makeObjectId("ann"), title: "Water works", body: "Sunday 9am" },
      [USER_ID, OWNER_ID],
    );
    expect(ok).toBe(true);
    expect(notification.create).toHaveBeenCalledTimes(2);
    const row = notification.create.mock.calls[0][0] as Record<string, unknown>;
    expect(row.type).toBe("announcement");
    expect(row.link).toBe("/dashboard/tenant/announcements");
  });
});
