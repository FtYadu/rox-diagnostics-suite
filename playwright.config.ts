import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env["ROX_E2E_BASE_URL"] ?? "http://localhost:8080",
    trace: "off",
  },
});
