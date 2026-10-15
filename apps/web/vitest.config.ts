import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // Portal- and preview-heavy jsdom suites share browser-like globals; run files serially in CI.
    maxWorkers: 1,
    minWorkers: 1,
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
