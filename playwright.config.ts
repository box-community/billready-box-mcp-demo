import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: {
    channel: "chrome",
    baseURL: "http://127.0.0.1:4311",
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://127.0.0.1:4311/api/health",
    reuseExistingServer: false,
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "verification/e2e-results.json" }],
  ],
});
