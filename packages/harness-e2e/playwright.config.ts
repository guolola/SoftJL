// Runs browser acceptance checks against production web bundles with mocked API contracts.
import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const reuseBuild = process.env.UML_E2E_USE_EXISTING_BUILD === "true" || process.env.PLAYWRIGHT_SKIP_BUILD === "1";
if (reuseBuild && !existsSync(path.join(repoRoot, "apps/web/.next/BUILD_ID"))) {
    throw new Error("UML_E2E_USE_EXISTING_BUILD requires a completed Web production build");
}
export default defineConfig({
    testDir: "./tests",
    // Keep local browser resource use predictable across the viewport/theme matrix.
    workers: 3,
    outputDir: "./test-results",
    timeout: 60000,
    expect: {
        timeout: 10000,
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
        env: { PUBLIC_WEB_BASE_URL: "https://community.example.test" },
        command: `${reuseBuild ? "" : "npm run build:web:production && "}npm run start --workspace @uml-platform/web -- --port 4175 --hostname 127.0.0.1`,
        cwd: repoRoot,
        url: "http://127.0.0.1:4175",
        reuseExistingServer: false,
        timeout: 180000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
