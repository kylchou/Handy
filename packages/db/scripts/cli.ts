/**
 * Usage: tsx scripts/cli.ts <migrate|seed|reset>
 * Reads DATABASE_URL from the environment or the repo-root .env.
 */
import { rmSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { createDb, findRepoRoot, seed } from "../src/index";

const root = findRepoRoot();
config({ path: path.join(root, ".env"), quiet: true });
const url = process.env.DATABASE_URL ?? "pglite://.data/handy";
const command = process.argv[2];

async function main() {
  if (command === "reset") {
    if (url.startsWith("pglite://") && url !== "pglite://memory") {
      rmSync(path.resolve(root, url.slice("pglite://".length)), { recursive: true, force: true });
    } else {
      const handle = await createDb(url, { ssl: process.env.DATABASE_SSL === "true" });
      await handle.db.execute(sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;`);
      await handle.close();
    }
    console.log("Database reset.");
  }
  if (!["migrate", "seed", "reset"].includes(command ?? "")) {
    console.error("Usage: cli.ts <migrate|seed|reset>");
    process.exit(1);
  }
  const handle = await createDb(url, { ssl: process.env.DATABASE_SSL === "true" });
  await handle.migrate();
  console.log(`Migrations applied (${handle.driver}).`);
  if (command === "seed" || command === "reset") await seed(handle.db);
  await handle.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
