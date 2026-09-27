import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    // The tests need more than the demo's one worker to check matching (see TEST_WORKERS in the seed).
    env: { SEED_EXTRA_WORKERS: "true" },
    hookTimeout: 60_000,
    // A real Postgres (TEST_DATABASE_URL) is shared between files, so run them one at a time.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
