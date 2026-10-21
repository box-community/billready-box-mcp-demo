import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/live-view",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4310",
    channel: "chrome",
    viewport: { width: 1600, height: 1000 },
  },
  reporter: [["list"]],
});
