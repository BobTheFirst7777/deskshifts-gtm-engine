import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { record } from "./activity";
import { getSettings } from "./settings";
import { assigneeFor } from "./leads";

export type Drafter = (leadId: string, followUpNumber: number) => Promise<string | null>;

/**
 * Build today's queue:
 *  1. follow-ups for leads with no reply N days after our last message
 *  2. first messages for the best researched leads, up to the daily target
 * Leads that are paused, hands-off (assigned to a person instead), won or lost are respected.
 */
export async function buildDailyQueue(
  opts: { draft?: Drafter; now?: Date; includeUnresearched?: boolean } = {},
) {
  const db = getDb();
  const settings = await getSettings();
  const now = opts.now ?? new Date();
  if (settings.automationPaused) return { paused: true, followUps: 0, firstTouches: 0, nurtured: 0 };

  const cutoff = new Date(now.getTime() - settings.followUpDays * 86400_000);

  // Leads that already have pending work are left alone.
  const pending = await db
    .select({ leadId: schema.actions.leadId })
    .from(schema.actions)
    .where(eq(schema.actions.status, "pending"));
  const busy = new Set(pending.map((p) => p.leadId));

  // ---- 1. follow-ups
  const contacted = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.stage, "contacted"), eq(schema.leads.paused, false), isNull(schema.leads.deletedAt)));

  let followUps = 0;
  let nurtured = 0;
  for (const lead of contacted) {
    if (busy.has(lead.id)) continue;
    const tps = await db
      .select()
      .from(schema.touchpoints)
      .where(and(eq(schema.touchpoints.leadId, lead.id), isNull(schema.touchpoints.deletedAt), sql`${schema.touchpoints.kind} <> 'note'`))
      .orderBy(desc(schema.touchpoints.occurredAt));
    const last = tps[0];
    if (!last || last.direction !== "out" || last.occurredAt > cutoff) continue;
    const outs = tps.filter((t) => t.direction === "out").length;
    const followUpNumber = outs; // first message + N-1 follow-ups already sent
    if (followUpNumber > settings.maxFollowUps) {
      await db.update(schema.leads).set({ stage: "nurture", updatedAt: now }).where(eq(schema.leads.id, lead.id));
      await record({
        actor: "system",
        entityType: "lead",
        entityId: lead.id,
        action: "update",
        summary: `${lead.fullName}: no reply after ${outs} messages, moved to nurture`,
        before: { stage: "contacted" },
        after: { stage: "nurture" },
      });
      nurtured++;
      continue;
    }
    let draft: string | null = null;
    try {
      draft = opts.draft ? await opts.draft(lead.id, followUpNumber) : null;
    } catch (e) {
      console.error("[queue] draft failed", e);
    }
    const [a] = await db
      .insert(schema.actions)
      .values({
        leadId: lead.id,
        type: "follow_up",
        channel: last.channel,
        assignee: assigneeFor(lead),
        priority: 70 + Math.min(20, Math.round((lead.score ?? 50) / 5)),
        reason: `No reply ${Math.round((now.getTime() - last.occurredAt.getTime()) / 86400_000)} days after message ${outs}`,
        draft,
        dueAt: now,
        createdBy: "system",
      })
      .returning();
    await record({ actor: "system", entityType: "action", entityId: a.id, action: "create", summary: `Follow-up #${followUpNumber} queued for ${lead.fullName}` });
    busy.add(lead.id);
    followUps++;
  }

  // ---- 2. first messages, best first, up to the daily target
  const [{ n: openToday }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.actions)
    .where(and(eq(schema.actions.status, "pending"), inArray(schema.actions.type, ["send_first", "follow_up"])));
  const room = Math.max(0, settings.dailyTarget - openToday);

  let firstTouches = 0;
  if (room > 0) {
    const candidates = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          inArray(schema.leads.stage, ["researched", "new"]),
          eq(schema.leads.paused, false),
          isNull(schema.leads.deletedAt),
          sql`${schema.leads.lastTouchAt} is null`,
          opts.includeUnresearched
            ? sql`true`
            : sql`(${schema.leads.stage} = 'researched' or ${schema.leads.score} is not null or ${schema.leads.owner} <> 'ai')`,
        ),
      )
      .orderBy(
        sql`case ${schema.leads.tier} when 'high_value' then 0 when 'event' then 1 else 2 end`,
        sql`${schema.leads.score} desc nulls last`,
        asc(schema.leads.createdAt),
      )
      .limit(room * 3);

    for (const lead of candidates) {
      if (firstTouches >= room) break;
      if (busy.has(lead.id)) continue;
      const [a] = await db
        .insert(schema.actions)
        .values({
          leadId: lead.id,
          type: "send_first",
          channel: lead.bestChannel ?? (lead.linkedinUrl ? "linkedin" : lead.email ? "email" : "linkedin"),
          assignee: assigneeFor(lead),
          priority: Math.min(90, 40 + Math.round((lead.score ?? 40) / 2) + (lead.tier === "high_value" ? 10 : 0)),
          reason: lead.whyRelevant ? lead.whyRelevant.slice(0, 200) : "New lead",
          draft: lead.draftMessage,
          variantId: lead.variantId,
          dueAt: now,
          createdBy: "system",
        })
        .returning();
      await record({ actor: "system", entityType: "action", entityId: a.id, action: "create", summary: `First message queued for ${lead.fullName}` });
      busy.add(lead.id);
      firstTouches++;
    }
  }

  return { paused: false, followUps, firstTouches, nurtured };
}
