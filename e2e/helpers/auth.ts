import { expect, type Page } from "@playwright/test";

export interface RoleCredentials {
  email: string;
  password: string;
  /** Dashboard shell heading asserted after login. */
  heading: string;
}

/**
 * Reads one role's credentials from env, e.g. E2E_ADMIN_EMAIL. Returns null
 * when the role is not configured (the spec then skips that flow).
 */
export function roleCredentials(prefix: string, heading: string): RoleCredentials | null {
  const email = process.env[`E2E_${prefix}_EMAIL`];
  const password = process.env[`E2E_${prefix}_PASSWORD`];
  if (!email || !password) return null;
  return { email, password, heading };
}

/**
 * Signs in through the real /auth form (POST /api/auth sets the httpOnly
 * `keja-token` cookie) and asserts the dashboard shell renders.
 * `identifier` accepts an email or a phone number.
 */
export async function loginAs(page: Page, credentials: RoleCredentials): Promise<void> {
  await page.goto("/auth");
  await page.getByPlaceholder("you@keja.co or +254712345678").fill(credentials.email);
  await page.getByPlaceholder("••••••••").fill(credentials.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  await page.waitForURL(/\/dashboard\//, { timeout: 20_000 });
  await expect(page.getByText(credentials.heading).first()).toBeVisible();
}
