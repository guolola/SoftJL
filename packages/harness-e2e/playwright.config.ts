// Runs browser acceptance checks against production web bundles with mocked API contracts.
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  testDir: "./tests",
  // Keep local browser resource use predictable across the viewport/theme matrix.
  workers: 3,
  outputDir: "./test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4175",
    channel: process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1" ? "chrome" : undefined,
    locale: "zh-CN",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build:web:production && npm run start --workspace @uml-platform/web -- --port 4175 --hostname 127.0.0.1",
    cwd: repoRoot,
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
