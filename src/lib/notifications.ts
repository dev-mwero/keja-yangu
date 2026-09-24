import {
  createComplaintStatusContent,
  createInvoicePaidContent,
  createLeaseExpiryContent,
  createOverdueContent,
  isEmailConfigured,
  sanitizeHeader,
  sendNotificationEmail,
} from "@/lib/email";
import { formatKES, formatPeriod } from "@/lib/format";
import { Invoice } from "@/models/Invoice";
import {
  Notification,
  type NotificationChannel,
  type NotificationType,
} from "@/models/Notification";
import { Property } from "@/models/Property";
import { Tenant } from "@/models/Tenant";
import { User } from "@/models/User";

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

const DAY_IN_MS = 86_400_000;

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

/**
 * Extracts the first event id from notification `data`; the dedupe key is the
 * event id namespaced by type, so `invoice:paid` and `invoice:overdue` for the
 * same invoice never collide.
 */
function resolveDedupeKey(type: NotificationType, data: Record<string, unknown>): string {
  const eventId =
    data.invoiceId ??
    data.leaseId ??
    data.complaintId ??
    data.announcementId ??
    data.messageId ??
    data.threadId ??
    "";
  return eventId === "" ? "" : `${type}:${String(eventId)}`;
}

export interface NotifyEmailInput {
  subjectPrefix: string;
  content: string;
  text: string;
  linkUrl: string;
  preheader: string;
  to?: string;
}

export interface NotifyUserInput {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  link?: string;
  channels?: NotificationChannel[];
  email?: NotifyEmailInput;
}

/**
 * Best-effort fan-out to one recipient: persists the in-app row (dedupe key
 * suppresses re-fires), then attempts email when requested and permitted.
 * Never throws — callers may `await` it without disturbing the request path.
 */
export async function notifyUser(userId: string, input: NotifyUserInput): Promise<boolean> {
  try {
    const data = input.data ?? {};
    const channels = input.channels ?? ["in-app"];
    const dedupeKey = resolveDedupeKey(input.type, data);

    let recipient: { role?: string; email?: string } | null = null;
    try {
      recipient = await User.findById(userId).select("role email").lean();
    } catch (_error) {
      console.warn(`[notifications] user lookup failed userId=${userId}`);
    }

    let created: { _id: unknown } | null = null;
    try {
      created = await Notification.create({
        recipientUserId: userId,
        recipientRole: recipient?.role,
        type: input.type,
        title: input.title,
        body: input.body,
        data,
        link: input.link ?? "",
        channels,
        dedupeKey,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        console.warn(
          `[notifications] dedupe skipped userId=${userId} type=${input.type} dedupeKey=${dedupeKey}`,
        );
        return true;
      }
      throw error;
    }

    if (
      channels.includes("email") &&
      input.email &&
      isEmailConfigured() &&
      (await wantsEmailNotifications(userId))
    ) {
      const to = input.email.to ?? recipient?.email;
      if (!to) {
        console.warn(`[notifications] no recipient email for userId=${userId}; email skipped`);
      } else {
        const sent = await sendNotificationEmail({ ...input.email, to });
        if (sent) {
          await Notification.updateOne(
            { _id: created?._id, emailSentAt: null },
            { $set: { emailSentAt: new Date() } },
          );
        }
      }
    }
    return true;
  } catch (_error) {
    console.warn(`[notifications] notifyUser failed userId=${userId} type=${input.type}`);
    return false;
  }
}

/** Missing `settings.emailNotifications` (legacy users) defaults to enabled. */
export async function wantsEmailNotifications(userId: string): Promise<boolean> {
  try {
    const user = await User.findById(userId).select("settings.emailNotifications").lean();
    return user?.settings?.emailNotifications ?? true;
  } catch (_error) {
    return true;
  }
}

async function resolveTenantUserId(tenantId: string): Promise<string> {
  if (!tenantId) return "";
  try {
    const tenant = await Tenant.findById(tenantId).select("userId").lean();
    return tenant?.userId ?? "";
  } catch (_error) {
    console.warn(`[notifications] tenant lookup failed tenantId=${tenantId}`);
    return "";
  }
}

async function resolveCaretakerIds(propertyId: string): Promise<string[]> {
  if (!propertyId) return [];
  try {
    const property = await Property.findById(propertyId).select("caretakerIds").lean();
    return property?.caretakerIds ?? [];
  } catch (_error) {
    console.warn(`[notifications] property lookup failed propertyId=${propertyId}`);
    return [];
  }
}

export interface InvoiceLike {
  _id: unknown;
  invoiceNumber?: string;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  period?: string;
  amountDue?: number;
}

export async function notifyInvoicePaid(invoice: InvoiceLike): Promise<boolean> {
  try {
    const invoiceId = String(invoice._id);
    const invoiceNumber = invoice.invoiceNumber ?? "";
    const period = invoice.period ?? "";
    const amountDue = invoice.amountDue ?? 0;
    const periodLabel = formatPeriod(period);
    const amount = formatKES(amountDue);
    const data = { invoiceId, period, amountDue };
    const base = appUrl();

    let ok = true;

    const tenantUserId = await resolveTenantUserId(invoice.tenantId);
    if (tenantUserId) {
      ok =
        (await notifyUser(tenantUserId, {
          type: "invoice:paid",
          title: "Invoice paid",
          body: `Payment of ${amount} for ${periodLabel} received. Thank you!`,
          data,
          link: "/dashboard/tenant/payments",
          channels: ["in-app", "email"],
          email: {
            subjectPrefix: `Invoice ${invoiceNumber} paid - Keja Yangu`,
            content: createInvoicePaidContent({ invoiceNumber, period, amountDue }),
            text: `Your payment of ${amount} for ${periodLabel} has been received.\n\nView your invoice: ${base}/dashboard/tenant/payments`,
            linkUrl: `${base}/dashboard/tenant/payments`,
            preheader: "Your payment has been received",
          },
        })) && ok;
    }

    ok =
      (await notifyUser(invoice.ownerId, {
        type: "invoice:paid",
        title: "Invoice paid",
        body: `Invoice ${invoiceNumber} (${periodLabel}) was paid for ${amount}`,
        data,
        link: "/dashboard/owner/accounting",
        channels: ["in-app"],
      })) && ok;

    const caretakerIds = await resolveCaretakerIds(invoice.propertyId);
    for (const caretakerId of caretakerIds) {
      ok =
        (await notifyUser(caretakerId, {
          type: "invoice:paid",
          title: "Invoice paid",
          body: `Invoice ${invoiceNumber} (${periodLabel}) was paid for ${amount}`,
          data,
          link: "/dashboard/caretaker/accounting",
          channels: ["in-app"],
        })) && ok;
    }

    return ok;
  } catch (_error) {
    console.warn("[notifications] notifyInvoicePaid failed");
    return false;
  }
}

export async function notifyInvoiceOverdue(invoice: InvoiceLike): Promise<boolean> {
  try {
    const invoiceId = String(invoice._id);
    const invoiceNumber = invoice.invoiceNumber ?? "";
    const period = invoice.period ?? "";
    const amountDue = invoice.amountDue ?? 0;
    const periodLabel = formatPeriod(period);
    const amount = formatKES(amountDue);
    const data = { invoiceId, period, amountDue };
    const base = appUrl();

    let ok = true;
    const staffTitle = "Invoice overdue";
    const staffBody = `Invoice ${invoiceNumber} (${periodLabel}) is overdue for ${amount}`;

    const tenantUserId = await resolveTenantUserId(invoice.tenantId);
    if (tenantUserId) {
      ok =
        (await notifyUser(tenantUserId, {
          type: "invoice:overdue",
          title: "Invoice overdue",
          body: `Your invoice for ${periodLabel} (${amount}) is overdue.`,
          data,
          link: "/dashboard/tenant/payments",
          channels: ["in-app", "email"],
          email: {
            subjectPrefix: `Invoice ${invoiceNumber} overdue - Keja Yangu`,
            content: createOverdueContent({ invoiceNumber, period, amountDue }),
            text: `Your invoice ${invoiceNumber} for ${periodLabel} (${amount}) is now overdue.\n\nPay now: ${base}/dashboard/tenant/payments`,
            linkUrl: `${base}/dashboard/tenant/payments`,
            preheader: "Your invoice is overdue",
          },
        })) && ok;
    }

    ok =
      (await notifyUser(invoice.ownerId, {
        type: "invoice:overdue",
        title: staffTitle,
        body: staffBody,
        data,
        link: "/dashboard/owner/accounting",
        channels: ["in-app"],
      })) && ok;

    const caretakerIds = await resolveCaretakerIds(invoice.propertyId);
    for (const caretakerId of caretakerIds) {
      ok =
        (await notifyUser(caretakerId, {
          type: "invoice:overdue",
          title: staffTitle,
          body: staffBody,
          data,
          link: "/dashboard/caretaker/accounting",
          channels: ["in-app"],
        })) && ok;
    }

    return ok;
  } catch (_error) {
    console.warn("[notifications] notifyInvoiceOverdue failed");
    return false;
  }
}

/**
 * Catch-up sweep for overdue invoices, fired lazily from `status=overdue`
 * list reads. `scope` limits the sweep to the actor's set (owner ids, tenant
 * ids, assigned properties) and is spread over the base filter.
 */
export async function notifyOverdueInvoices(
  now: Date = new Date(),
  scope: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    const invoices = await Invoice.find({
      status: "pending",
      dueDate: { $lt: now },
      ...scope,
    })
      .sort({ dueDate: 1 })
      .limit(200)
      .lean();
    let ok = true;
    for (const invoice of invoices) {
      ok = (await notifyInvoiceOverdue(invoice)) && ok;
    }
    return ok;
  } catch (_error) {
    console.warn("[notifications] notifyOverdueInvoices failed");
    return false;
  }
}

export interface LeaseLike {
  _id: unknown;
  tenantId: string;
  propertyId: string;
  ownerId: string;
  rentAmount?: number;
  endDate?: Date | null;
}

export async function notifyLeaseExpiry(lease: LeaseLike, daysUntil: number): Promise<boolean> {
  try {
    const data = { leaseId: String(lease._id), propertyId: lease.propertyId };
    const base = appUrl();
    const unit = daysUntil === 1 ? "day" : "days";
    const title = "Lease expiring soon";
    const tenantBody = `Your lease ends in ${daysUntil} ${unit}.`;
    const staffBody = `A lease ends in ${daysUntil} ${unit}.`;

    let ok = true;

    const tenantUserId = await resolveTenantUserId(lease.tenantId);
    if (tenantUserId) {
      ok =
        (await notifyUser(tenantUserId, {
          type: "lease:expiring",
          title,
          body: tenantBody,
          data,
          link: "/dashboard/tenant/payments",
          channels: ["in-app", "email"],
          email: {
            subjectPrefix: "Lease expiring soon - Keja Yangu",
            content: createLeaseExpiryContent({
              daysUntil,
              endDate: lease.endDate ?? undefined,
              rentAmount: lease.rentAmount,
            }),
            text: `Your lease ends in ${daysUntil} ${unit}.\n\nView your lease details: ${base}/dashboard/tenant/payments`,
            linkUrl: `${base}/dashboard/tenant/payments`,
            preheader: "Your lease is ending soon",
          },
        })) && ok;
    }

    ok =
      (await notifyUser(lease.ownerId, {
        type: "lease:expiring",
        title,
        body: staffBody,
        data,
        link: "/dashboard/owner/accounting",
        channels: ["in-app", "email"],
        email: {
          subjectPrefix: "Lease expiring soon - Keja Yangu",
          content: createLeaseExpiryContent({
            daysUntil,
            endDate: lease.endDate ?? undefined,
            rentAmount: lease.rentAmount,
          }),
          text: `A lease ends in ${daysUntil} ${unit}.\n\nView your leases: ${base}/dashboard/owner/accounting`,
          linkUrl: `${base}/dashboard/owner/accounting`,
          preheader: "A lease is ending soon",
        },
      })) && ok;

    const caretakerIds = await resolveCaretakerIds(lease.propertyId);
    for (const caretakerId of caretakerIds) {
      ok =
        (await notifyUser(caretakerId, {
          type: "lease:expiring",
          title,
          body: staffBody,
          data,
          link: "/dashboard/caretaker/accounting",
          channels: ["in-app"],
        })) && ok;
    }

    return ok;
  } catch (_error) {
    console.warn("[notifications] notifyLeaseExpiry failed");
    return false;
  }
}

export interface ComplaintLike {
  _id: unknown;
  tenantId: string;
  propertyId: string;
  subject: string;
  status?: string;
  priority?: string;
}

export async function notifyComplaintCreated(complaint: ComplaintLike): Promise<boolean> {
  try {
    const data = { complaintId: String(complaint._id), propertyId: complaint.propertyId };
    const title = "New complaint";
    const body = `New ${complaint.priority ?? "medium"} priority complaint: ${complaint.subject}`;
    let ok = true;

    let property: { ownerId?: string; caretakerIds?: string[] } | null = null;
    try {
      property = await Property.findById(complaint.propertyId)
        .select("ownerId caretakerIds")
        .lean();
    } catch (_error) {
      console.warn(`[notifications] property lookup failed propertyId=${complaint.propertyId}`);
    }
    if (!property) return false;

    if (property.ownerId) {
      ok =
        (await notifyUser(property.ownerId, {
          type: "complaint:created",
          title,
          body,
          data,
          link: "/dashboard/owner/communications",
          channels: ["in-app"],
        })) && ok;
    }
    for (const caretakerId of property.caretakerIds ?? []) {
      ok =
        (await notifyUser(caretakerId, {
          type: "complaint:created",
          title,
          body,
          data,
          link: "/dashboard/caretaker/communications",
          channels: ["in-app"],
        })) && ok;
    }

    return ok;
  } catch (_error) {
    console.warn("[notifications] notifyComplaintCreated failed");
    return false;
  }
}

export async function notifyComplaintStatusChange(complaint: ComplaintLike): Promise<boolean> {
  try {
    const complaintId = String(complaint._id);
    const data = { complaintId };
    const subject = complaint.subject;
    const status = complaint.status ?? "updated";

    const tenantUserId = await resolveTenantUserId(complaint.tenantId);
    if (!tenantUserId) return true;

    return notifyUser(tenantUserId, {
      type: "complaint:status-changed",
      title: "Complaint update",
      body: `Your complaint "${subject}" is now ${status}.`,
      data,
      link: "/dashboard/tenant/complaints",
      channels: ["in-app", "email"],
      email: {
        subjectPrefix: `Complaint "${sanitizeHeader(subject)}" ${status} - Keja Yangu`,
        content: createComplaintStatusContent({ subject, status }),
        text: `Your complaint "${subject}" is now ${status}.`,
        linkUrl: `${appUrl()}/dashboard/tenant/complaints`,
        preheader: "Your complaint status has changed",
      },
    });
  } catch (_error) {
    console.warn("[notifications] notifyComplaintStatusChange failed");
    return false;
  }
}

export interface MessageLike {
  _id: unknown;
  threadId: string;
  senderUserId: string;
  text: string;
}

export async function notifyMessageReply(
  message: MessageLike,
  recipientUserId: string,
): Promise<boolean> {
  try {
    if (!recipientUserId || recipientUserId === message.senderUserId) return true;
    return notifyUser(recipientUserId, {
      type: "chat:reply",
      title: "New message",
      body: message.text,
      data: { messageId: String(message._id), threadId: message.threadId },
      link: "/dashboard/tenant/chat",
      channels: ["in-app"],
    });
  } catch (_error) {
    console.warn("[notifications] notifyMessageReply failed");
    return false;
  }
}

export interface AnnouncementLike {
  _id: unknown;
  title: string;
  body: string;
}

export async function notifyAnnouncement(
  announcement: AnnouncementLike,
  recipientUserIds: string[],
): Promise<boolean> {
  try {
    const data = { announcementId: String(announcement._id) };
    let ok = true;
    for (const userId of recipientUserIds) {
      ok =
        (await notifyUser(userId, {
          type: "announcement",
          title: announcement.title,
          body: announcement.body,
          data,
          link: "/dashboard/tenant/announcements",
          channels: ["in-app"],
        })) && ok;
    }
    return ok;
  } catch (_error) {
    console.warn("[notifications] notifyAnnouncement failed");
    return false;
  }
}

export { DAY_IN_MS };
