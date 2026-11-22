import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { ACTION_TYPES, CHANNELS, CHANNEL_LABEL } from "@/lib/constants";
import { isHuman } from "@/lib/actors";
import { record, diff } from "./activity";
import { assigneeFor, getLead, NotFound } from "./leads";

export const actionInput = z.object({
  leadId: z.string().uuid(),
  type: z.enum(ACTION_TYPES).default("custom"),
  channel: z.enum(CHANNELS).nullish(),
  assignee: z.string().nullish(),
  dueAt: z.coerce.date().nullish(),
  draft: z.string().nullish(),
  reason: z.string().nullish(),
  priority: z.coerce.number().int().min(0).max(100).nullish(),
  variantId: z.string().uuid().nullish(),
});

export async function createAction(raw: z.input<typeof actionInput>, actor: string) {
  const input = actionInput.parse(raw);
  const db = getDb();
  const lead = await getLead(input.leadId);
  if (!lead || lead.deletedAt) throw new NotFound("Lead not found");
  const [row] = await db
    .insert(schema.actions)
    .values({
      leadId: lead.id,
      type: input.type,
      channel: input.channel ?? lead.bestChannel ?? null,
      assignee: input.assignee ?? (isHuman(actor) ? actor : assigneeFor(lead)),
      dueAt: input.dueAt ?? new Date(),
      draft: input.draft ?? null,
      reason: input.reason ?? null,
      priority: input.priority ?? 50,
      variantId: input.variantId ?? null,
      manualFields: isHuman(actor) && input.draft ? ["draft"] : [],
      createdBy: actor,
    })
    .returning();
  await record({
    actor,
    entityType: "action",
    entityId: row.id,
    action: "create",
    summary: `New ${row.type} for ${lead.fullName} (${row.assignee})`,
    after: row,
  });
  return row;
}

export const actionPatch = z
  .object({
    assignee: z.string(),
    dueAt: z.coerce.date(),
    draft: z.string().nullable(),
    subject: z.string().nullable(),
    batch: z.string().nullable(),
    channel: z.enum(CHANNELS).nullable(),
    priority: z.coerce.number().int().min(0).max(100),
    reason: z.string().nullable(),
  })
  .partial();

export async function updateAction(id: string, raw: z.input<typeof actionPatch>, actor: string) {
  const db = getDb();
  const [cur] = await db.select().from(schema.actions).where(eq(schema.actions.id, id));
  if (!cur) throw new NotFound("Action not found");
  const patch = actionPatch.parse(raw) as Record<string, unknown>;
  const human = isHuman(actor);
  const skipped: string[] = [];
  for (const k of Object.keys(patch)) {
    if (!human && cur.manualFields.includes(k)) {
      delete patch[k];
      skipped.push(k);
    }
  }
  const d = diff(cur as unknown as Record<string, unknown>, patch);
  if (!d.changed.length) return { action: cur, skipped };
  const manual = human ? Array.from(new Set([...cur.manualFields, ...d.changed])) : cur.manualFields;
  const [row] = await db
    .update(schema.actions)
    .set({ ...d.after, manualFields: manual, updatedAt: new Date() })
    .where(eq(schema.actions.id, id))
    .returning();
  await record({
    actor,
    entityType: "action",
    entityId: id,
    action: "update",
    summary: `Edited ${cur.type}: ${d.changed.join(", ")}`,
    before: d.before,
    after: d.after,
  });
  return { action: row, skipped };
}

export async function setActionStatus(
  id: string,
  status: "done" | "skipped" | "cancelled" | "pending",
  actor: string,
  note?: string,
) {
  const db = getDb();
  const [cur] = await db.select().from(schema.actions).where(eq(schema.actions.id, id));
  if (!cur) throw new NotFound("Action not found");
  const [row] = await db
    .update(schema.actions)
    .set({
      status,
      completedAt: status === "pending" ? null : new Date(),
      completedBy: status === "pending" ? null : actor,
      reason: note ? `${cur.reason ? cur.reason + " · " : ""}${note}` : cur.reason,
      updatedAt: new Date(),
    })
    .where(eq(schema.actions.id, id))
    .returning();
  await record({
    actor,
    entityType: "action",
    entityId: id,
    action: status === "done" ? "complete" : status === "skipped" ? "skip" : "update",
    summary: `${status === "pending" ? "Reopened" : status[0].toUpperCase() + status.slice(1)}: ${cur.type}${note ? ` (${note})` : ""}`,
    before: { status: cur.status },
    after: { status },
  });
  return row;
}

function endOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Today's to-do list, highest priority first. Paused or deleted leads are left out. */
export async function listQueue(
  opts: { assignee?: string; includeFuture?: boolean; limit?: number; approvedOnly?: boolean } = {},
) {
  const db = getDb();
  const conds = [
    eq(schema.actions.status, "pending"),
    isNull(schema.leads.deletedAt),
    eq(schema.leads.paused, false),
  ];
  if (!opts.includeFuture) conds.push(lte(schema.actions.dueAt, endOfToday()));
  if (opts.assignee) conds.push(eq(schema.actions.assignee, opts.assignee));
  if (opts.approvedOnly) conds.push(isNotNull(schema.actions.approvedAt));
  return db
    .select({ action: schema.actions, lead: schema.leads, company: schema.companies })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.actions.leadId, schema.leads.id))
    .leftJoin(schema.companies, eq(schema.leads.companyId, schema.companies.id))
    .where(and(...conds))
    .orderBy(desc(schema.actions.priority), asc(schema.actions.dueAt))
    .limit(opts.limit ?? 200);
}

export async function recentlyCompleted(sinceHours = 24) {
  const db = getDb();
  const since = new Date(Date.now() - sinceHours * 3600_000);
  return db
    .select({ action: schema.actions, lead: schema.leads })
    .from(schema.actions)
    .innerJoin(schema.leads, eq(schema.actions.leadId, schema.leads.id))
    .where(and(inArray(schema.actions.status, ["done", "skipped"]), gte(schema.actions.completedAt, since)))
    .orderBy(desc(schema.actions.completedAt));
}

export async function pendingCount() {
  const db = getDb();
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.actions)
    .where(and(eq(schema.actions.status, "pending"), lte(schema.actions.dueAt, endOfToday())));
  return r?.n ?? 0;
}

export function defaultBatchName(channel: string | null, d = new Date()) {
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  const ch = channel ? (CHANNEL_LABEL[channel] ?? channel) : "Mixed";
  return `${day} · ${ch}`;
}

/**
 * Approve tasks so Instinct may send them. Each approved task joins a batch
 * (by default "<date> · <channel>") so results can be compared batch by batch.
 */
export async function approveActions(ids: string[], actor: string, approve = true, batchName?: string | null) {
  if (!ids.length) return 0;
  const db = getDb();
  const current = await db
    .select()
    .from(schema.actions)
    .where(and(inArray(schema.actions.id, ids), eq(schema.actions.status, "pending")));
  for (const r of current) {
    const batch = approve ? (batchName?.trim() || r.batch || defaultBatchName(r.channel)) : null;
    await db
      .update(schema.actions)
      .set({ approvedAt: approve ? new Date() : null, approvedBy: approve ? actor : null, batch, updatedAt: new Date() })
      .where(eq(schema.actions.id, r.id));
    await record({
      actor,
      entityType: "action",
      entityId: r.id,
      action: "update",
      summary: approve ? `Approved ${r.type} for sending (batch "${batch}")` : `Unapproved ${r.type}`,
      before: { approvedAt: r.approvedAt, batch: r.batch },
      after: { approvedAt: approve ? new Date() : null, batch },
    });
  }
  return current.length;
}

/** Outbound drafts waiting for a person's approval (the Review & send list). */
export async function reviewQueue(opts: { channel?: string; assignee?: string } = {}) {
  const rows = await listQueue({ assignee: opts.assignee ?? "instinct", includeFuture: true, limit: 500 });
  return rows.filter(
    (r) =>
      !r.action.approvedAt &&
      ["connect", "send_first", "follow_up"].includes(r.action.type) &&
      (!opts.channel || r.action.channel === opts.channel),
  );
}

/** What Instinct should work on now, honouring approve-first mode and the LinkedIn pace limit. */
export async function instinctQueue(mode: "approve" | "auto", linkedinLimit: number) {
  const rows = await listQueue({ assignee: "instinct", approvedOnly: mode === "approve" });
  const db = getDb();
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [{ n: sentToday }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.touchpoints)
    .where(and(eq(schema.touchpoints.channel, "linkedin"), eq(schema.touchpoints.direction, "out"), gte(schema.touchpoints.occurredAt, since)));
  let room = Math.max(0, linkedinLimit - sentToday);
  const out = [];
  for (const r of rows) {
    if (r.action.channel === "linkedin" && ["send_first", "follow_up", "connect"].includes(r.action.type)) {
      if (room <= 0) continue;
      room--;
    }
    out.push(r);
  }
  return { tasks: out, linkedinSentToday: sentToday, waitingApproval: mode === "approve" ? (await listQueue({ assignee: "instinct" })).length - rows.length : 0 };
}
