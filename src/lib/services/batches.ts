import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { record } from "./activity";

export type BatchSummary = {
  name: string;
  firstSentAt: Date | null;
  lastSentAt: Date | null;
  sent: number;
  connectionRequests: number;
  accepted: number;
  messages: number;
  replied: number;
  silent: number;
  waitingToSend: number;
  replyRate: number | null;
  acceptRate: number | null;
};

/** Every batch with its numbers, newest first. */
export async function listBatches(limit = 50): Promise<BatchSummary[]> {
  const db = getDb();
  const sent = await db
    .select()
    .from(schema.touchpoints)
    .where(and(isNotNull(schema.touchpoints.batch), eq(schema.touchpoints.direction, "out"), isNull(schema.touchpoints.deletedAt)));
  const waiting = await db
    .select({ batch: schema.actions.batch, n: sql<number>`count(*)::int` })
    .from(schema.actions)
    .where(and(isNotNull(schema.actions.batch), eq(schema.actions.status, "pending")))
    .groupBy(schema.actions.batch);

  const names = new Set<string>([...sent.map((t) => t.batch!), ...waiting.map((w) => w.batch!)]);
  const out: BatchSummary[] = [];
  for (const name of names) {
    const d = await batchDetail(name);
    out.push(d.summary);
  }
  return out
    .sort((a, b) => (b.lastSentAt?.getTime() ?? Date.now()) - (a.lastSentAt?.getTime() ?? Date.now()))
    .slice(0, limit);
}

/** One row per person in a batch: what was sent, whether they accepted / replied, and what they said. */
export async function batchDetail(name: string) {
  const db = getDb();
  const sends = await db
    .select({ tp: schema.touchpoints, lead: schema.leads, company: schema.companies })
    .from(schema.touchpoints)
    .innerJoin(schema.leads, eq(schema.touchpoints.leadId, schema.leads.id))
    .leftJoin(schema.companies, eq(schema.leads.companyId, schema.companies.id))
    .where(and(eq(schema.touchpoints.batch, name), eq(schema.touchpoints.direction, "out"), isNull(schema.touchpoints.deletedAt)))
    .orderBy(desc(schema.touchpoints.occurredAt));

  const leadIds = [...new Set(sends.map((s) => s.lead.id))];
  const inbound = leadIds.length
    ? await db
        .select()
        .from(schema.touchpoints)
        .where(and(inArray(schema.touchpoints.leadId, leadIds), eq(schema.touchpoints.direction, "in"), isNull(schema.touchpoints.deletedAt)))
    : [];

  const waiting = await db
    .select({ action: schema.actions, lead: schema.leads })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.actions.leadId, schema.leads.id))
    .where(and(eq(schema.actions.batch, name), eq(schema.actions.status, "pending")));

  const now = Date.now();
  const rows = sends.map(({ tp, lead, company }) => {
    const after = inbound.filter((i) => i.leadId === lead.id && i.occurredAt >= tp.occurredAt);
    const accepted = after.find((i) => i.kind === "connection_accepted") ?? null;
    const reply = after.filter((i) => i.kind !== "connection_accepted").sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())[0] ?? null;
    return {
      lead,
      company,
      sent: tp,
      kind: tp.kind,
      accepted,
      reply,
      daysWaiting: reply ? null : Math.floor((now - tp.occurredAt.getTime()) / 86400_000),
      stage: lead.stage,
    };
  });

  const conn = rows.filter((r) => r.kind === "connection_request");
  const msgs = rows.filter((r) => r.kind !== "connection_request");
  const replied = rows.filter((r) => r.reply).length;
  const times = sends.map((s) => s.tp.occurredAt.getTime());
  const summary: BatchSummary = {
    name,
    firstSentAt: times.length ? new Date(Math.min(...times)) : null,
    lastSentAt: times.length ? new Date(Math.max(...times)) : null,
    sent: rows.length,
    connectionRequests: conn.length,
    accepted: conn.filter((r) => r.accepted).length,
    messages: msgs.length,
    replied,
    silent: rows.length - replied,
    waitingToSend: waiting.length,
    replyRate: rows.length ? replied / rows.length : null,
    acceptRate: conn.length ? conn.filter((r) => r.accepted).length / conn.length : null,
  };
  return { summary, rows, waiting };
}

/** Compact batch results for agents. */
export async function batchResultsForAgents(name?: string) {
  if (!name) return { batches: await listBatches(20) };
  const d = await batchDetail(name);
  return {
    summary: d.summary,
    people: d.rows.map((r) => ({
      leadId: r.lead.id,
      name: r.lead.fullName,
      company: r.company?.name ?? null,
      segment: r.lead.segment,
      tier: r.lead.tier,
      importance: r.lead.score,
      pitchAngle: r.lead.pitchAngle,
      sent: { kind: r.kind, channel: r.sent.channel, at: r.sent.occurredAt, text: r.sent.content },
      acceptedAt: r.accepted?.occurredAt ?? null,
      reply: r.reply ? { at: r.reply.occurredAt, label: r.reply.replyLabel, text: r.reply.content } : null,
      daysWaiting: r.daysWaiting,
    })),
    notSentYet: d.waiting.map((w) => ({ name: w.lead.fullName, task: w.action.type })),
  };
}

export const recommendationInput = z.object({
  title: z.string().min(1).describe("e.g. 'Nov 22 LinkedIn batch: what worked'"),
  body: z.string().min(1).describe("Markdown: what worked, what didn't (with numbers), and specific changes for the next batch"),
  batch: z.string().nullish(),
});

/** Agents (or people) write recommendations; they show on Insights and feed later drafts. */
export async function saveRecommendation(raw: z.input<typeof recommendationInput>, actor: string) {
  const r = recommendationInput.parse(raw);
  const db = getDb();
  const [row] = await db
    .insert(schema.insights)
    .values({
      title: r.title,
      body: r.body,
      stats: r.batch ? { batch: r.batch } : null,
      periodEnd: new Date().toISOString().slice(0, 10),
      createdBy: actor,
    })
    .returning();
  await record({ actor, entityType: "settings", entityId: row.id, action: "create", summary: `Recommendations: ${r.title}` });
  return row;
}

export async function latestInsights(limit = 3) {
  const db = getDb();
  return db.select().from(schema.insights).orderBy(desc(schema.insights.createdAt)).limit(limit);
}
