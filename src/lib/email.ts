import nodemailer from "nodemailer";
import { formatKES, formatPeriod } from "./format";

/**
 * Strips CR/LF and other control characters from a value destined for an email
 * header (subject lines). Header injection requires a line break — replacing
 * control chars with a space neutralizes it without mangling normal text.
 */
export function sanitizeHeader(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: deliberately strips CR/LF/control chars that could inject email headers.
  return value.replace(/[\r\n\u0000-\u001f]/g, " ");
}

/** HTML-escapes a user-controlled value before it is interpolated into an email body. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function unquote(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function createTransporter() {
  if (!isEmailConfigured()) {
    console.warn(
      "[email] SMTP is not configured. Email delivery is disabled for this environment.",
    );
    return null;
  }

  const host = process.env.EMAIL_HOST ?? "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT ?? "587", 10);
  const secure = process.env.EMAIL_SECURE === "true" || port === 465;
  const user = unquote(process.env.EMAIL_USER ?? "");
  const pass = unquote(process.env.EMAIL_PASS ?? "");

  console.log("[email] Config:", { host, port, secure, user, pass: `${pass.slice(0, 3)}***` });

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: false,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
    pool: false,
    maxConnections: 1,
    maxMessages: 1,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

function getTransporter() {
  return createTransporter();
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!isEmailConfigured()) {
    console.warn("[email] Skipping send for %s because SMTP is not configured.", options.to);
    return false;
  }

  try {
    const transporter = getTransporter();
    if (!transporter) return false;

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM
        ? unquote(process.env.EMAIL_FROM)
        : "Keja Yangu <no-reply@keja.co>",
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    console.log("Email sent:", info.messageId);
    return true;
  } catch (error) {
    console.error("Email sending failed:", error);
    return false;
  }
}

const BRAND_COLOR = "#143E6B";
const BRAND_COLOR_LIGHT = "#1e5a9b";
const SECONDARY_COLOR = "#64748b";
const BACKGROUND_COLOR = "#f8fafc";
const CARD_BACKGROUND = "#ffffff";
const BORDER_COLOR = "#e2e8f0";
const TEXT_PRIMARY = "#1e293b";
const TEXT_SECONDARY = "#475569";

function createEmailTemplate(content: string, preheader?: string): string {
  const preheaderText = preheader
    ? `<span style="display: none; max-height: 0; overflow: hidden; color: transparent; mso-hide: all; font-size: 1px; line-height: 1px;">${preheader}</span>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Keja Yangu</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${BACKGROUND_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;">
  ${preheaderText}
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${BACKGROUND_COLOR};">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: ${CARD_BACKGROUND}; border-radius: 12px; border: 1px solid ${BORDER_COLOR}; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); padding: 32px 24px; text-align: center;">
              <div style="display: inline-block; width: 56px; height: 56px; background-color: rgba(255, 255, 255, 0.2); border-radius: 16px; text-align: center; line-height: 56px;">
                <span style="font-size: 24px; font-weight: 700; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">KY</span>
              </div>
              <h1 style="margin: 16px 0 0; color: #ffffff; font-size: 24px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Keja Yangu</h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; font-weight: 400;">Where home begins</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 32px;">
              ${content}
            </td>
          </tr>
          
          <!-- Divider -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <hr style="border: none; border-top: 1px solid ${BORDER_COLOR}; margin: 0;">
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid ${BORDER_COLOR}; padding-top: 24px;">
                <tr>
                  <td style="text-align: center; padding-bottom: 16px;">
                    <p style="margin: 0 0 8px; font-size: 13px; color: ${SECONDARY_COLOR}; font-weight: 500;">Keja Yangu</p>
                    <p style="margin: 0; font-size: 12px; color: ${SECONDARY_COLOR}; line-height: 1.6;">This email was sent to <strong>{{EMAIL}}</strong>. If you didn't request this, please ignore this email or contact support.</p>
                  </td>
                </tr>
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0; font-size: 11px; color: ${SECONDARY_COLOR}; opacity: 0.7;">&copy; ${new Date().getFullYear()} Keja Yangu. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.replace("{{EMAIL}}", ""); // Will be replaced per-email
}

function createVerificationContent(name: string): string {
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">Welcome to Keja Yangu! We're excited to have you on board. To get started, please verify your email address by clicking the button below:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{VERIFY_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 14px 0 rgba(20, 62, 107, 0.4); transition: all 0.2s ease;">Verify Your Email</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${SECONDARY_COLOR}; line-height: 1.6; text-align: center;">Or copy and paste this link into your browser:<br><span style="word-break: break-all; color: ${BRAND_COLOR}; font-size: 13px;">{{VERIFY_URL}}</span></p>
    <div style="margin-top: 32px; padding: 16px; background-color: ${BACKGROUND_COLOR}; border-radius: 8px; border: 1px solid ${BORDER_COLOR};">
      <p style="margin: 0; font-size: 13px; color: ${SECONDARY_COLOR}; line-height: 1.6;"><strong>⏱ This link expires in 24 hours.</strong> If it expires, you can request a new verification email from the app.</p>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${SECONDARY_COLOR}; line-height: 1.6;">If you didn't create an account with Keja Yangu, you can safely ignore this email.</p>
  `;
}

function createPasswordResetContent(name: string): string {
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">We received a request to reset your password for your Keja Yangu account. Click the button below to create a new password:</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{RESET_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 14px 0 rgba(20, 62, 107, 0.4);">Reset Your Password</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${SECONDARY_COLOR}; line-height: 1.6; text-align: center;">Or copy and paste this link into your browser:<br><span style="word-break: break-all; color: ${BRAND_COLOR}; font-size: 13px;">{{RESET_URL}}</span></p>
    <div style="margin-top: 32px; padding: 16px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">
      <p style="margin: 0; font-size: 13px; color: #991b1b; line-height: 1.6;"><strong>⚠ Security notice:</strong> This link expires in 1 hour. If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
    </div>
  `;
}

function createWelcomeContent(name: string, role: string): string {
  const roleLabel = escapeHtml(role.charAt(0).toUpperCase() + role.slice(1));
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">Welcome to Keja Yangu! Your email has been verified and your account is now active as a <strong>${roleLabel}</strong>.</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">You can now access your dashboard and start managing your properties, applications, and more.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; box-shadow: 0 4px 14px 0 rgba(20, 62, 107, 0.4);">Go to Dashboard</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${SECONDARY_COLOR}; line-height: 1.6;">If you have any questions, our support team is here to help.</p>
  `;
}

function renderTemplate(content: string, url: string, preheader?: string): string {
  const filledContent = content.replace(/{{VERIFY_URL}}|{{RESET_URL}}|{{APP_URL}}/g, url);
  return createEmailTemplate(filledContent, preheader);
}

export interface SendNotificationEmailOptions {
  to: string;
  subjectPrefix: string;
  content: string;
  text: string;
  linkUrl: string;
  preheader: string;
}

/**
 * Best-effort notification email. `content` must only use the `{{APP_URL}}`
 * placeholder — callers pass the absolute deep link as `linkUrl`. The subject
 * is `subjectPrefix` stamped with a UTC timestamp by `uniqueSubject`.
 */
export async function sendNotificationEmail(
  options: SendNotificationEmailOptions,
): Promise<boolean> {
  const html = renderTemplate(options.content, options.linkUrl, options.preheader);
  return sendEmail({
    to: options.to,
    subject: uniqueSubject(options.subjectPrefix),
    html,
    text: options.text,
  });
}

export interface NotificationLeadContentInput {
  invoiceNumber?: string;
  period: string;
  amountDue?: number;
}

export function createInvoicePaidContent(input: NotificationLeadContentInput): string {
  const amount = formatKES(input.amountDue ?? 0);
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi there,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">We're confirming receipt of your payment of <strong>${amount}</strong> for <strong>${formatPeriod(input.period)}</strong>.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">View Invoice</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${SECONDARY_COLOR}; line-height: 1.6;">Invoice <strong>${escapeHtml(input.invoiceNumber ?? "")}</strong> · ${amount} · ${formatPeriod(input.period)}</p>
  `;
}

export function createInvoicePaidStaffContent(input: NotificationLeadContentInput): string {
  const amount = formatKES(input.amountDue ?? 0);
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi there,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">Invoice <strong>${escapeHtml(input.invoiceNumber ?? "")}</strong> for <strong>${formatPeriod(input.period)}</strong> was paid in full (${amount}).</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">View Invoice</a>
    </div>
  `;
}

export function createOverdueContent(input: NotificationLeadContentInput): string {
  const amount = formatKES(input.amountDue ?? 0);
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi there,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">Your invoice <strong>${escapeHtml(input.invoiceNumber ?? "")}</strong> for <strong>${formatPeriod(input.period)}</strong> (${amount}) is now overdue.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Pay Now</a>
    </div>
    <p style="margin: 24px 0 0; font-size: 14px; color: ${SECONDARY_COLOR}; line-height: 1.6;">Please arrange payment as soon as possible to keep your account in good standing.</p>
  `;
}

export interface LeaseExpiryContentInput {
  daysUntil: number;
  endDate?: Date;
  rentAmount?: number;
}

export function createLeaseExpiryContent(input: LeaseExpiryContentInput): string {
  const when = input.endDate
    ? new Date(input.endDate).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "soon";
  const period = input.daysUntil === 1 ? "1 day" : `${input.daysUntil} days`;
  const rent = input.rentAmount != null ? ` (${formatKES(input.rentAmount)}/month)` : "";
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi there,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">Your lease ends in <strong>${period}</strong> (${when})${rent}. Let us know if you'd like to renew.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">View Lease</a>
    </div>
  `;
}

export interface ComplaintStatusContentInput {
  subject: string;
  status: string;
}

export function createComplaintStatusContent(input: ComplaintStatusContentInput): string {
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi there,</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">Your complaint "<strong>${escapeHtml(input.subject)}</strong>" is now <strong>${escapeHtml(input.status)}</strong>.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">View Complaint</a>
    </div>
  `;
}

export interface AnnouncementContentInput {
  title: string;
  body: string;
}

export function createAnnouncementContent(input: AnnouncementContentInput): string {
  return `
    <p style="margin: 0 0 16px; font-size: 16px; color: ${TEXT_PRIMARY}; line-height: 1.6;">Hi there,</p>
    <p style="margin: 0 0 8px; font-size: 15px; color: ${TEXT_PRIMARY}; line-height: 1.6; font-weight: 600;">${escapeHtml(input.title)}</p>
    <p style="margin: 0 0 24px; font-size: 15px; color: ${TEXT_SECONDARY}; line-height: 1.6;">${escapeHtml(input.body)}</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{APP_URL}}" style="display: inline-block; background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_LIGHT} 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">View Announcement</a>
    </div>
  `;
}

export function uniqueSubject(subject: string): string {
  const sanitized = sanitizeHeader(subject);
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  return `${sanitized} [${stamp} UTC]`;
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  name: string,
): Promise<boolean> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${token}`;
  const content = createVerificationContent(name);
  const html = renderTemplate(
    content,
    verifyUrl,
    `Verify your email to activate your Keja Yangu account`,
  );
  const text = `Hi ${name},\n\nWelcome to Keja Yangu! Please verify your email by clicking this link: ${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, please ignore this email.`;

  return sendEmail({
    to: email,
    subject: uniqueSubject("Verify your email - Keja Yangu"),
    html,
    text,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  name: string,
): Promise<boolean> {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`;
  const content = createPasswordResetContent(name);
  const html = renderTemplate(content, resetUrl, `Reset your Keja Yangu password`);
  const text = `Hi ${name},\n\nWe received a request to reset your password. Click this link to reset: ${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.`;

  return sendEmail({
    to: email,
    subject: uniqueSubject("Reset your password - Keja Yangu"),
    html,
    text,
  });
}

export async function sendWelcomeEmail(
  email: string,
  name: string,
  role: string,
): Promise<boolean> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const content = createWelcomeContent(name, role);
  const html = renderTemplate(
    content,
    `${appUrl}/dashboard`,
    `Welcome to Keja Yangu - Your account is now active`,
  );
  const text = `Hi ${name},\n\nWelcome to Keja Yangu! Your account is now active as a ${role.charAt(0).toUpperCase() + role.slice(1)}. Access your dashboard at: ${appUrl}/dashboard`;

  return sendEmail({
    to: email,
    subject: uniqueSubject("Welcome to Keja Yangu - Your account is active"),
    html,
    text,
  });
}
