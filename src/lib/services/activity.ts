import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type EntityType = "lead" | "company" | "touchpoint" | "action" | "signal" | "event" | "variant" | "settings";

export async function record(opts: {
  actor: string;
  entityType: EntityType;
  entityId: string;
  action: "create" | "update" | "delete" | "restore" | "merge" | "complete" | "skip" | "revert";
  summary?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  const db = getDb();
  await db.insert(schema.activity).values({
    actor: opts.actor,
    entityType: opts.entityType,
    entityId: opts.entityId,
    action: opts.action,
    summary: opts.summary ?? null,
    before: opts.before ? jsonSafe(opts.before) : null,
    after: opts.after ? jsonSafe(opts.after) : null,
  });
}

export async function recentActivity(limit = 100, entityId?: string) {
  const db = getDb();
  const q = db.select().from(schema.activity);
  const rows = entityId
    ? await q.where(eq(schema.activity.entityId, entityId)).orderBy(desc(schema.activity.createdAt)).limit(limit)
    : await q.orderBy(desc(schema.activity.createdAt)).limit(limit);
  return rows;
}

/** Keep only the fields that changed between two objects. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) {
      b[k] = before[k] ?? null;
      a[k] = after[k] ?? null;
    }
  }
  return { before: b, after: a, changed: Object.keys(a) };
}

function jsonSafe(o: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
}
