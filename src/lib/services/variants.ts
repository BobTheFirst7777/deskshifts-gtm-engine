import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { CHANNELS } from "@/lib/constants";
import { record, diff } from "./activity";
import { NotFound } from "./leads";

export const variantInput = z.object({
  name: z.string().trim().min(1),
  angle: z.string().nullish(),
  segment: z.string().nullish(),
  channel: z.enum(CHANNELS).nullish(),
  body: z.string().trim().min(1),
  status: z.enum(["active", "paused", "retired"]).default("active"),
});

export async function listVariants(activeOnly = false) {
  const db = getDb();
  const rows = await db.select().from(schema.messageVariants).orderBy(desc(schema.messageVariants.createdAt));
  return activeOnly ? rows.filter((r) => r.status === "active") : rows;
}

export async function createVariant(raw: z.input<typeof variantInput>, actor: string) {
  const v = variantInput.parse(raw);
  const db = getDb();
  const [row] = await db
    .insert(schema.messageVariants)
    .values({ ...v, angle: v.angle ?? null, segment: v.segment ?? null, channel: v.channel ?? null, createdBy: actor })
    .returning();
  await record({ actor, entityType: "variant", entityId: row.id, action: "create", summary: `New message version "${row.name}"`, after: row });
  return row;
}

export async function updateVariant(id: string, raw: Partial<z.input<typeof variantInput>>, actor: string) {
  const db = getDb();
  const [cur] = await db.select().from(schema.messageVariants).where(eq(schema.messageVariants.id, id));
  if (!cur) throw new NotFound("Variant not found");
  const patch = variantInput.partial().parse(raw) as Record<string, unknown>;
  const d = diff(cur as unknown as Record<string, unknown>, patch);
  if (!d.changed.length) return cur;
  const [row] = await db
    .update(schema.messageVariants)
    .set({ ...d.after, updatedAt: new Date() })
    .where(eq(schema.messageVariants.id, id))
    .returning();
  await record({ actor, entityType: "variant", entityId: id, action: "update", summary: `Edited "${cur.name}": ${d.changed.join(", ")}`, before: d.before, after: d.after });
  return row;
}
