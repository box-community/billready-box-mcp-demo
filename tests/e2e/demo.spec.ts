import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
test("conference rehearsal: initial → wrong acceptance → follow-up → upload → review/save → reload → discovery", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good morning, Avery." }),
  ).toBeVisible();
  let before = await (await request.get("/api/state")).json();
  expect(before.totals.ready).toBe(2400000);
  expect(before.totals.blocked).toBe(3400000);
  await page.screenshot({
    path: "verification/desktop-overview.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "What should I focus on today?" })
    .click();
  await expect(
    page.getByText("[Development adapter · deterministic rehearsal]", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Alder & Finch", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Alder & Finch", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "What is preventing us from billing?",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByText("SUPPORTING EVIDENCE", { exact: true }),
  ).toBeVisible();
  const wrong = path.resolve(
    "demo-kit/upload-to-box/BillReady Demo/Projects/CW-102 Marlow Hotel/03 Acceptance/CW-102-signed-acceptance.pdf",
  );
  await page.getByLabel("Upload signed acceptance PDF").setInputFiles(wrong);
  await expect(page.getByRole("status")).toContainText("different client");
  let s = await (await request.get("/api/state")).json();
  expect(s.totals.blocked).toBe(3400000);
  await page.getByLabel("Ask BillReady").fill("Draft a customer follow-up.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Review customer follow-up Preview, edit & approve saving",
    })
    .click();
  await expect(page.getByLabel("Email recipient")).toHaveValue(
    "morgan.ellis@alderfinch.example",
  );
  await page
    .getByLabel("Email body")
    .fill(
      "Hi Morgan,\nPlease return signed acceptance for CW-101 M3. Completion report attached.\nAvery",
    );
  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Internal follow-up approved",
  );
  await page
    .getByLabel("Upload signed acceptance PDF")
    .setInputFiles(
      path.resolve("demo-kit/presenter-only/CW-101-signed-acceptance.pdf"),
    );
  await expect(page.getByRole("status")).toContainText("Acceptance verified");
  s = await (await request.get("/api/state")).json();
  expect(s.totals.ready).toBe(4200000);
  expect(s.totals.blocked).toBe(1600000);
  expect(s.totals.invoiced).toBe(before.totals.invoiced);
  expect(s.totals.outstanding).toBe(before.totals.outstanding);
  await page.screenshot({
    path: "verification/desktop-hero-accepted.png",
    fullPage: true,
  });
  await page.getByLabel("Ask BillReady").fill("Prepare the draft invoice.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Review billing package Preview, edit & approve saving",
    })
    .last()
    .click();
  await expect(page.getByTitle("Draft invoice preview")).toBeVisible();
  await page.screenshot({
    path: "verification/invoice-review.png",
    fullPage: true,
  });
  const preview = await request.get("/api/proposals/billing-CW-101-M3/invoice");
  expect(preview.headers()["content-type"]).toContain("application/pdf");
  await page
    .getByRole("button", { name: "Email & follow-up", exact: true })
    .click();
  await page
    .getByLabel("Email subject")
    .fill("CW-101 final billing package — owner reviewed");
  await page
    .getByRole("button", { name: "Evidence & attachments", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /Attach CW-101-acceptance/ }).last(),
  ).toBeChecked();
  await page.getByRole("button", { name: "Approve & save" }).click();
  await expect(page.getByRole("status")).toContainText("Prepared for billing");
  await page.reload();
  await page
    .getByRole("button", { name: "Review & approvals", exact: false })
    .click();
  await expect(
    page.getByRole("button", {
      name: /Draft invoice & billing packet.*Saved for billing/,
    }),
  ).toBeVisible();
  s = await (await request.get("/api/state")).json();
  expect(s.totals.invoiced).toBe(before.totals.invoiced);
  expect(s.totals.outstanding).toBe(before.totals.outstanding);
  const saved = s.proposals.find((p: any) => p.id === "billing-CW-101-M3");
  expect(saved.savedIds).toHaveLength(4);
  await request.post("/api/proposals/billing-CW-101-M3/approve", {
    data: { confirm: true },
  });
  const afterRetry = await (await request.get("/api/state")).json();
  expect(afterRetry.documents.length).toBe(s.documents.length);
  await page
    .getByRole("button", { name: "Project documents", exact: false })
    .click();
  await page
    .getByRole("button", {
      name: "Preview CW-101-completion-report.pdf",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Document preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("link", {
      name: "Download CW-101-completion-report.pdf",
      exact: true,
    })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "CW-101-completion-report.pdf",
  );
  await page
    .getByRole("button", { name: "Northstar Health", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Find the missing acceptance document.",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("I found and checked matching acceptance", { exact: false }),
  ).toBeVisible();
  s = await (await request.get("/api/state")).json();
  expect(s.totals.ready).toBe(5800000);
  expect(s.totals.blocked).toBe(0);
  await page
    .getByRole("button", { name: "All projects 5", exact: true })
    .click();
  await page.getByPlaceholder("Find a project…").fill("Fieldstone");
  await expect(page.getByRole("row")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Close agent", exact: true }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({
    path: "verification/mobile-overview.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Ask BillReady", exact: true })
    .click();
  await expect(page.getByLabel("Ask BillReady")).toBeVisible();
  await page.screenshot({
    path: "verification/mobile-agent.png",
    fullPage: true,
  });
});
