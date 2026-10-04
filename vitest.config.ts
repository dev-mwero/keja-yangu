import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**"],
      // TODO: add per-file coverage thresholds (>=80% lines, >=75% branches) for
      // src/lib/permissions.ts, src/lib/schemas/**, and the six property route modules
      // once those files exist. Example shape:
      // thresholds: {
      //   "src/lib/permissions.ts": { lines: 80, branches: 75 },
      //   "src/lib/schemas/**": { lines: 80, branches: 75 },
      //   "src/app/api/properties/**/route.ts": { lines: 80, branches: 75 },
      // },
    },
  },
});
