import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Lead } from "@/lib/db/schema";
import { record } from "./activity";
import { getSettings } from "./settings";
import { assigneeFor, getLead } from "./leads";

export type Drafter = (leadId: string, followUpNumber: number) => Promise<string | null>;

/** Kinds that count as "we messaged them" (a connection request or acceptance doesn't). */
export const MESSAGE_KINDS = ["message", "call", "meeting"] as const;

async function hasPendingOutbound(leadId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.actions.id })
    .from(schema.actions)
    .where(
      and(
        eq(schema.actions.leadId, leadId),
        eq(schema.actions.status, "pending"),
        inArray(schema.actions.type, ["send_first", "follow_up", "connect", "respond"]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Put a lead's next first-outreach step up for review:
 *  - LinkedIn, not connected yet → a connection request (with the note)
 *  - LinkedIn, request pending → nothing (wait for them to accept)
 *  - LinkedIn connected, or email → the first message
 * Returns the task created, or null if nothing was needed.
 */
export async function queueFirstTouch(leadId: string, opts: { force?: boolean; now?: Date } = {}) {
  const db = getDb();
  const lead = await getLead(leadId);
  if (!lead || lead.deletedAt || lead.paused) return null;
  if (!["new", "researched"].includes(lead.stage)) return null;
  if (await hasPendingOutbound(lead.id)) return null;

  const settings = await getSettings();
  if (!opts.force) {
    if (settings.automationPaused) return null;
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.actions)
      .where(and(eq(schema.actions.status, "pending"), inArray(schema.actions.type, ["send_first", "follow_up", "connect"])));
    if (n >= settings.dailyTarget) return null;
  }

  const channel = lead.bestChannel ?? (lead.linkedinUrl ? "linkedin" : lead.email ? "email" : "linkedin");
  let type: "connect" | "send_first" = "send_first";
  if (channel === "linkedin") {
    if (lead.linkedinStatus === "pending") return null;
    if (lead.linkedinStatus !== "connected") type = "connect";
  }
  // Already messaged once (e.g. by hand): nothing to start.
  const [touched] = await db
    .select({ id: schema.touchpoints.id })
    .from(schema.touchpoints)
    .where(
      and(
        eq(schema.touchpoints.leadId, lead.id),
        eq(schema.touchpoints.direction, "out"),
        inArray(schema.touchpoints.kind, type === "connect" ? ["connection_request", ...MESSAGE_KINDS] : [...MESSAGE_KINDS]),
        isNull(schema.touchpoints.deletedAt),
      ),
    )
    .limit(1);
  if (touched) return null;

  return createOutreachTask(lead, type, channel, opts.now);
}

export async function createOutreachTask(lead: Lead, type: "connect" | "send_first", channel: string, now = new Date()) {
  const db = getDb();
  const [a] = await db
    .insert(schema.actions)
    .values({
      leadId: lead.id,
      type,
      channel,
      assignee: assigneeFor(lead),
      priority: Math.min(95, 40 + Math.round((lead.score ?? 40) / 2) + (lead.tier === "high_value" ? 10 : 0)),
      reason: lead.pitchAngle ?? lead.whyRelevant?.slice(0, 200) ?? "New lead",
      draft: type === "connect" ? lead.connectionNote : lead.draftMessage,
      subject: channel === "email" ? lead.emailSubject : null,
      variantId: lead.variantId,
      dueAt: now,
      createdBy: "system",
    })
    .returning();
  await record({
    actor: "system",
    entityType: "action",
    entityId: a.id,
    action: "create",
    summary: `${type === "connect" ? "Connection request" : "First message"} ready for review: ${lead.fullName}`,
  });
  return a;
}

/**
 * Build today's queue:
 *  1. follow-ups for leads with no reply N days after our last real message
 *  2. first steps (connection request or message) for the best researched leads, up to the daily target
 * Paused, hands-off (assigned to a person instead), won and lost leads are respected.
 */
export async function buildDailyQueue(
  opts: { draft?: Drafter; now?: Date; includeUnresearched?: boolean } = {},
) {
  const db = getDb();
  const settings = await getSettings();
  const now = opts.now ?? new Date();
  if (settings.automationPaused) return { paused: true, followUps: 0, firstTouches: 0, nurtured: 0 };

  const cutoff = new Date(now.getTime() - settings.followUpDays * 86400_000);

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
      .where(
        and(
          eq(schema.touchpoints.leadId, lead.id),
          isNull(schema.touchpoints.deletedAt),
          notInArray(schema.touchpoints.kind, ["note", "connection_request", "connection_accepted"]),
        ),
      )
      .orderBy(desc(schema.touchpoints.occurredAt));
    const last = tps[0];
    if (!last || last.direction !== "out" || last.occurredAt > cutoff) continue;
    const outs = tps.filter((t) => t.direction === "out").length;
    const followUpNumber = outs;
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
    await record({ actor: "system", entityType: "action", entityId: a.id, action: "create", summary: `Follow-up #${followUpNumber} ready for review: ${lead.fullName}` });
    busy.add(lead.id);
    followUps++;
  }

  // ---- 2. first steps, best first, up to the daily target
  const candidates = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        inArray(schema.leads.stage, ["researched", "new"]),
        eq(schema.leads.paused, false),
        isNull(schema.leads.deletedAt),
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
    .limit(settings.dailyTarget * 4);

  let firstTouches = 0;
  for (const c of candidates) {
    if (busy.has(c.id)) continue;
    const a = await queueFirstTouch(c.id, { now });
    if (a) {
      busy.add(c.id);
      firstTouches++;
    }
  }

  return { paused: false, followUps, firstTouches, nurtured };
}
