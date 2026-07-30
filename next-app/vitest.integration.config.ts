import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Real-database integration tests. Deliberately separate from
 * vitest.config.ts (the unit-test suite, which never touches Postgres)
 * so `npm run test` stays fast and hermetic, and this suite always runs
 * against the dedicated test database (see vitest.integration.setup.ts
 * and DATABASE_SETUP.md) — never a developer's local dev database, and
 * never production.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./vitest.integration.setup.ts"],
    include: ["src/**/*.integration.test.ts"],
    // Sequential: these tests share one database and reset creator data
    // between runs, so they must not race each other.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
