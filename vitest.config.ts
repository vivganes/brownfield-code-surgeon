import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}"],
    reporters: ["default"],
    globals: true,
    environment: "jsdom",
    setupFiles: ["packages/ui/vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "coverage",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/dist/**",
        "**/node_modules/**",
        "packages/*/src/build/**",
      ],
    },
  },
});
