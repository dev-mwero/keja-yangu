import nodemailer from "nodemailer";

function createTransporter() {
  const host = process.env.EMAIL_HOST ?? "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT ?? "587", 10);
  const secure = process.env.EMAIL_SECURE === "true" || port === 465;

  console.log("[email] Config:", { host, port, secure, user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS?.slice(0, 3) + "***" });

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    pool: false,
    maxConnections: 1,
    maxMessages: 1,
    authMethod: "LOGIN",
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  });
}

function getTransporter() {
  // Create fresh transporter each time to avoid connection state issues
  return createTransporter();
}

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? "Keja Yangu <no-reply@keja.co>",
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

export async function sendVerificationEmail(email: string, token: string): Promise<boolean> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #143E6B;">Welcome to Keja Yangu</h1>
      <p>Click the button below to verify your email:</p>
      <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: #143E6B; color: white; text-decoration: none; border-radius: 8px;">Verify Email</a>
      <p style="margin-top: 20px; color: #666;">This link expires in 24 hours.</p>
    </div>
  `;
  return sendEmail({
    to: email,
    subject: "Verify your email - Keja Yangu",
    html,
    text: `Click here to verify: ${verifyUrl}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #143E6B;">Password Reset</h1>
      <p>Click the button below to reset your password:</p>
      <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #143E6B; color: white; text-decoration: none; border-radius: 8px;">Reset Password</a>
      <p style="margin-top: 20px; color: #666;">This link expires in 1 hour.</p>
    </div>
  `;
  return sendEmail({
    to: email,
    subject: "Reset your password - Keja Yangu",
    html,
    text: `Click here to reset: ${resetUrl}`,
  });
}