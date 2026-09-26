import { sql } from "drizzle-orm";
import { createDb, seed, type DbHandle } from "@handy/db";

/**
 * A fresh, migrated, seeded database for a test file. Uses in-memory PGlite by
 * default; set TEST_DATABASE_URL to run against a real Postgres (CI does both).
 * With a real server the files share one database, so vitest runs them one at
 * a time and each file starts by wiping it.
 */
export async function createTestDb(): Promise<DbHandle> {
  const url = process.env.TEST_DATABASE_URL || undefined;
  const handle = await createDb(url ?? "pglite://memory");
  if (url) {
    await handle.db.execute(sql.raw("DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"));
  }
  await handle.migrate();
  await seed(handle.db, () => {});
  return handle;
}
