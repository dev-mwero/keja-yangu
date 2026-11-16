import { expect, test } from "@playwright/test";

const PUBLIC_PAGES = [
  { path: "/", heading: /find a home that/i },
  { path: "/about", heading: /calmer way/i },
  { path: "/pricing", heading: /simple, transparent pricing/i },
  { path: "/faq", heading: /frequently asked questions/i },
  { path: "/contact", heading: /get in touch/i },
  { path: "/terms", heading: /terms of service/i },
  { path: "/privacy", heading: /privacy policy/i },
];

for (const page of PUBLIC_PAGES) {
  test(`public page renders: ${page.path}`, async ({ page: p }) => {
    await p.goto(page.path);
    await expect(p.getByRole("heading", { level: 1 })).toContainText(page.heading);
  });
}

test("home FAQ accordion expands", async ({ page }) => {
  await page.goto("/");
  const first = page.locator("details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
});

test("404 page renders for unknown route", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");
  await expect(page.getByRole("heading", { name: /page not found/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /return home/i })).toBeVisible();
});
