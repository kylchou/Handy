import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
/** A database handle or an open transaction. Repositories take either one. */
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Database;
  driver: "pg" | "pglite";
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/** Walks up from cwd to the monorepo root (the directory with pnpm-workspace.yaml). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

/**
 * Opens a database from a URL:
 * - `postgres://...` or `postgresql://...`: a real Postgres server
 * - `pglite://memory`: in-memory Postgres, used by the tests
 * - `pglite://<path>`: embedded Postgres saved at <path> (relative to the repo root)
 */
export async function createDb(url: string): Promise<DbHandle> {
  if (url.startsWith("pglite://")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const target = url.slice("pglite://".length);
    let client: InstanceType<typeof PGlite>;
    if (target === "memory" || target === "") {
      client = new PGlite();
    } else {
      const dataDir = path.resolve(findRepoRoot(), target);
      mkdirSync(dataDir, { recursive: true });
      client = new PGlite(dataDir);
    }
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as Database,
      driver: "pglite",
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => client.close(),
    };
  }

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const { default: pg } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema });
    return {
      db: db as unknown as Database,
      driver: "pg",
      migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
      close: () => pool.end(),
    };
  }

  throw new Error(`Unsupported DATABASE_URL "${url}". Use postgres://... or pglite://<path>.`);
}
