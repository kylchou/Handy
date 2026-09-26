import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // A real Postgres (TEST_DATABASE_URL) is shared between files, so run them one at a time.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
