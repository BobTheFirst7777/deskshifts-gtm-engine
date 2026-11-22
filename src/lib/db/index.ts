import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __gtmDb?: DB };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Local/dev: an embedded Postgres (PGlite) stored in a folder, no server needed.
  if (url.startsWith("pglite:")) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PGlite } = require("@electric-sql/pglite");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle: drizzlePglite } = require("drizzle-orm/pglite");
    const path = url.slice("pglite:".length) || undefined;
    const client = new PGlite(path === "memory" ? undefined : path);
    return drizzlePglite(client, { schema }) as unknown as DB;
  }

  const pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });
  return drizzle(pool, { schema });
}

export function getDb(): DB {
  if (!globalForDb.__gtmDb) globalForDb.__gtmDb = create();
  return globalForDb.__gtmDb;
}

/** For tests: swap in a database. */
export function setDb(db: DB) {
  globalForDb.__gtmDb = db;
}

export { schema };
