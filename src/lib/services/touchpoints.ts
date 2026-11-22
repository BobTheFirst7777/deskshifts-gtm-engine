import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { CHANNELS, REPLY_LABELS, STAGE_RANK, TOUCH_KINDS, type Stage } from "@/lib/constants";
import { isHuman, defaultHuman } from "@/lib/actors";
import { record } from "./activity";
import { cancelPendingActions, getLead, NotFound } from "./leads";

export const touchpointInput = z.object({
  leadId: z.string().uuid(),
  channel: z.enum(CHANNELS).catch("other"),
  direction: z.enum(["out", "in"]),
  kind: z.enum(TOUCH_KINDS).default("message"),
  subject: z.string().nullish(),
  content: z.string().nullish(),
  replyLabel: z.enum(REPLY_LABELS).nullish(),
  variantId: z.string().uuid().nullish(),
  actionId: z.string().uuid().nullish(),
  occurredAt: z.coerce.date().nullish(),
});
export type TouchpointInput = z.input<typeof touchpointInput>;

/** Move a lead's stage forward only; never backwards from an automatic event. */
async function advanceStage(leadId: string, to: Stage, actor: string, why: string) {
  const db = getDb();
  const lead = await getLead(leadId);
  if (!lead) return;
  const from = lead.stage as Stage;
  if (from === to) return;
  if (to !== "lost" && to !== "nurture" && STAGE_RANK[to] <= STAGE_RANK[from]) return;
  if ((from === "won" || from === "lost") && to !== "replied") return;
  await db.update(schema.leads).set({ stage: to, updatedAt: new Date() }).where(eq(schema.leads.id, leadId));
  await record({
    actor,
    entityType: "lead",
    entityId: leadId,
    action: "update",
    summary: `${lead.fullName}: stage ${from} → ${to} (${why})`,
    before: { stage: from },
    after: { stage: to },
  });
}

/**
 * Log something that happened with a lead: a message sent, a reply received,
 * a call, a meeting or a note. Works the same whether a person or an agent logs it,
 * and keeps the pipeline and the queue in sync.
 */
export async function logTouchpoint(raw: TouchpointInput, actor: string) {
  const input = touchpointInput.parse(raw);
  const db = getDb();
  const lead = await getLead(input.leadId);
  if (!lead || lead.deletedAt) throw new NotFound("Lead not found");

  let variantId = input.variantId ?? null;
  let actionRow = null;
  if (input.actionId) {
    [actionRow] = await db.select().from(schema.actions).where(eq(schema.actions.id, input.actionId));
    if (actionRow && !variantId) variantId = actionRow.variantId;
  }

  const [tp] = await db
    .insert(schema.touchpoints)
    .values({
      leadId: lead.id,
      channel: input.channel,
      direction: input.direction,
      kind: input.kind,
      subject: input.subject ?? null,
      content: input.content ?? null,
      replyLabel: input.direction === "in" ? (input.replyLabel ?? null) : null,
      variantId,
      occurredAt: input.occurredAt ?? new Date(),
      createdBy: actor,
    })
    .returning();

  const verb =
    input.kind === "note"
      ? "Note"
      : input.direction === "out"
        ? `Sent ${input.kind.replace("_", " ")} via ${input.channel}`
        : `Reply via ${input.channel}${input.replyLabel ? ` (${input.replyLabel})` : ""}`;
  await record({
    actor,
    entityType: "touchpoint",
    entityId: tp.id,
    action: "create",
    summary: `${verb}: ${lead.fullName}`,
    after: tp,
  });

  if (input.kind === "note") return { touchpoint: tp };

  await db
    .update(schema.leads)
    .set({ lastTouchAt: tp.occurredAt, updatedAt: new Date() })
    .where(eq(schema.leads.id, lead.id));

  if (input.direction === "out") {
    // Close the action this fulfils: the given one, or the oldest pending outbound one.
    const outbound = ["send_first", "follow_up", "connect", "call", "respond"];
    if (!actionRow) {
      [actionRow] = await db
        .select()
        .from(schema.actions)
        .where(
          and(
            eq(schema.actions.leadId, lead.id),
            eq(schema.actions.status, "pending"),
            inArray(schema.actions.type, outbound),
          ),
        )
        .orderBy(asc(schema.actions.dueAt))
        .limit(1);
    }
    if (actionRow && actionRow.status === "pending") {
      await db
        .update(schema.actions)
        .set({ status: "done", completedAt: new Date(), completedBy: actor, updatedAt: new Date() })
        .where(eq(schema.actions.id, actionRow.id));
      await record({
        actor,
        entityType: "action",
        entityId: actionRow.id,
        action: "complete",
        summary: `Done: ${actionRow.type} for ${lead.fullName}`,
      });
    }
    if (input.kind === "meeting") await advanceStage(lead.id, "meeting", actor, "meeting logged");
    else await advanceStage(lead.id, "contacted", actor, "first outreach");
  } else {
    // A reply: stop automatic follow-ups and hand it to a person.
    await cancelPendingActions(lead.id, actor, "Lead replied", ["follow_up", "send_first", "connect"]);
    if (input.replyLabel === "unsubscribe") {
      await advanceStage(lead.id, "lost", actor, "asked to stop");
      await cancelPendingActions(lead.id, actor, "Asked to stop");
    } else if (input.replyLabel === "wrong_person") {
      await advanceStage(lead.id, "nurture", actor, "wrong person");
    } else {
      await advanceStage(lead.id, input.kind === "meeting" ? "meeting" : "replied", actor, "reply received");
      if (input.replyLabel === "not_now") await advanceStage(lead.id, "nurture", actor, "not now");
      const existing = await db
        .select()
        .from(schema.actions)
        .where(
          and(eq(schema.actions.leadId, lead.id), eq(schema.actions.status, "pending"), eq(schema.actions.type, "respond")),
        );
      if (!existing.length && input.replyLabel !== "not_now") {
        const who = lead.owner && lead.owner !== "ai" ? lead.owner : isHuman(actor) ? actor : defaultHuman();
        const [a] = await db
          .insert(schema.actions)
          .values({
            leadId: lead.id,
            type: "respond",
            channel: input.channel,
            assignee: who,
            priority: input.replyLabel === "interested" ? 95 : 80,
            reason: `Replied via ${input.channel}${input.replyLabel ? ` (${input.replyLabel})` : ""}`,
            dueAt: new Date(),
            createdBy: "system",
          })
          .returning();
        await record({
          actor: "system",
          entityType: "action",
          entityId: a.id,
          action: "create",
          summary: `Respond to ${lead.fullName}`,
        });
      }
    }
  }
  return { touchpoint: tp };
}

export async function deleteTouchpoint(id: string, actor: string) {
  const db = getDb();
  const [tp] = await db.select().from(schema.touchpoints).where(eq(schema.touchpoints.id, id));
  if (!tp) throw new NotFound("Touchpoint not found");
  await db.update(schema.touchpoints).set({ deletedAt: new Date() }).where(eq(schema.touchpoints.id, id));
  await record({ actor, entityType: "touchpoint", entityId: id, action: "delete", summary: "Removed a timeline entry", before: tp });
}
