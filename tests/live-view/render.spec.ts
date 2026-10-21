import { test, expect } from "@playwright/test";
test("render the actual live app after reset at desktop and mobile sizes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Live · Box remote MCP", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Good morning, Avery." }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/live-desktop-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Alder & Finch", exact: true })
    .click();
  await expect(
    page.getByText("$18,000 is waiting on customer acceptance", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/live-desktop-project.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Ask BillReady", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "verification/live-mobile-overview.png",
    fullPage: true,
  });
});
