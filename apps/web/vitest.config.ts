import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from 'node:path';
import tsconfig from './tsconfig.json';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: Object.entries(tsconfig.compilerOptions.paths).map(([key, [target]]) => ({
    find: new RegExp('^' + key.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '(.*)') + '$'),
    replacement: path.resolve(__dirname, target).replace('*', '$1'),
  })) },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    css: true,
    // Portal- and preview-heavy jsdom suites share browser-like globals; run files serially in CI.
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
