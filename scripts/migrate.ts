/**
 * Applies database migrations in ./drizzle.
 * Runs automatically before `next build` on Vercel, and via `npm run db:migrate` locally.
 */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL not set, skipping migrations.");
    return;
  }
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const p = url.slice("pglite:".length);
    const client = new PGlite(p === "memory" ? undefined : p);
    await migrate(drizzle(client), { migrationsFolder });
    await client.close();
  } else {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({
      connectionString: url,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    await migrate(drizzle(pool), { migrationsFolder });
    await pool.end();
  }
  console.log("[migrate] Database is up to date.");
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
