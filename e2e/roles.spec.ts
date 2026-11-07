import { expect, test } from "@playwright/test";

import { loginAs, roleCredentials } from "./helpers/auth";

/**
 * The five critical role flows: each role signs in through the real auth form
 * and lands on its dashboard shell. Each flow self-skips unless its seeded
 * credentials are configured (E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD) — see
 * e2e/README.md.
 */
const FLOWS = [
  { prefix: "ADMIN", heading: "Portfolio overview", label: "admin dashboard" },
  { prefix: "CUSTODIAN", heading: "Custodian overview", label: "custodian dashboard" },
  { prefix: "CARETAKER", heading: "Hello,", label: "caretaker dashboard" },
  { prefix: "TENANT", heading: "Welcome back,", label: "tenant dashboard" },
  { prefix: "SYSTEM_ADMIN", heading: "Platform overview", label: "system-admin dashboard" },
] as const;

for (const flow of FLOWS) {
  test(`role flow: ${flow.label} signs in and sees its dashboard`, async ({ page }) => {
    const credentials = roleCredentials(flow.prefix, flow.heading);
    test.skip(
      !credentials,
      `E2E_${flow.prefix}_EMAIL / E2E_${flow.prefix}_PASSWORD not configured`,
    );
    if (!credentials) return;
    await loginAs(page, credentials);
    await expect(page).toHaveURL(/\/dashboard\//);
  });
}
