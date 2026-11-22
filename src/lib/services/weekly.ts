import { and, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { overview, replyBreakdown, type BreakdownRow } from "./stats";
import { record } from "./activity";

type Writer = (stats: Record<string, unknown>, replies: string[]) => Promise<string | null>;

function pct(r: number | null) {
  return r === null ? "n/a" : `${Math.round(r * 100)}%`;
}

function table(rows: BreakdownRow[]) {
  if (!rows.length) return "_No outbound yet._";
  return rows
    .slice(0, 8)
    .map((r) => `- ${r.label ?? r.key ?? "(none)"}: ${r.replied}/${r.contacted} replied (${pct(r.rate)})`)
    .join("\n");
}

/** Weekly review: numbers always; an AI write-up on top when a key is set. */
export async function runWeeklyReview(write?: Writer) {
  const db = getDb();
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 86400_000);
  const ov = await overview();
  const byVariant = await replyBreakdown("variant", 60);
  const byChannel = await replyBreakdown("channel", 60);
  const bySegment = await replyBreakdown("segment", 60);
  const byTier = await replyBreakdown("tier", 60);

  const replies = await db
    .select({ tp: schema.touchpoints, lead: schema.leads })
    .from(schema.touchpoints)
    .innerJoin(schema.leads, eq(schema.touchpoints.leadId, schema.leads.id))
    .where(and(eq(schema.touchpoints.direction, "in"), ne(schema.touchpoints.kind, "connection_accepted"), gte(schema.touchpoints.occurredAt, start), isNull(schema.touchpoints.deletedAt)))
    .orderBy(desc(schema.touchpoints.occurredAt))
    .limit(15);
  const sample = replies.map((r) => `${r.lead.fullName} (${r.lead.segment ?? r.lead.tier}, ${r.tp.channel}, ${r.tp.replyLabel ?? "unlabelled"}): ${(r.tp.content ?? "").slice(0, 400)}`);

  const stats = { overview: { ...ov, byStage: undefined, bySource: undefined }, byVariant, byChannel, bySegment, byTier };

  const numbers = [
    `**This week:** ${ov.added7} leads added, ${ov.contacted7} contacted, ${ov.replied7} replied. 30-day reply rate ${pct(ov.replyRate30)} (${ov.replied30}/${ov.contacted30}).`,
    `\n**By message version**\n${table(byVariant)}`,
    `\n**By channel**\n${table(byChannel)}`,
    `\n**By segment**\n${table(bySegment)}`,
    `\n**By tier**\n${table(byTier)}`,
  ].join("\n");

  let review: string | null = null;
  try {
    review = write ? await write(stats, sample) : null;
  } catch (e) {
    console.error("[weekly] AI write-up failed", e);
  }
  const body = review ? `${review}\n\n---\n\n${numbers}` : numbers;

  const [row] = await db
    .insert(schema.insights)
    .values({
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: now.toISOString().slice(0, 10),
      title: `Week ending ${now.toISOString().slice(0, 10)}`,
      body,
      stats,
      createdBy: "system",
    })
    .returning();
  await record({ actor: "system", entityType: "settings", entityId: row.id, action: "create", summary: "Weekly review written" });
  return row;
}
