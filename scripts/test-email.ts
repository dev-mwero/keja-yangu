import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { sendVerificationEmail } from "@/lib/email";

async function main() {
  const testEmail = process.argv[2] || "test@example.com";
  const testToken = "test-token-" + Date.now();

  console.log(`Sending test verification email to: ${testEmail}`);
  console.log(`EMAIL_HOST: ${process.env.EMAIL_HOST}`);
  console.log(`EMAIL_PORT: ${process.env.EMAIL_PORT}`);
  console.log(`EMAIL_USER: ${process.env.EMAIL_USER}`);
  console.log(`EMAIL_PASS: ${process.env.EMAIL_PASS?.slice(0, 3)}***`);

  try {
    await sendVerificationEmail(testEmail, testToken, "Test User");
    console.log("✅ Email sent successfully!");
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    process.exit(1);
  }
}

main();