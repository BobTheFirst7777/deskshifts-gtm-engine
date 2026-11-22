import { and, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ACTION_LABEL, CHANNEL_LABEL, REPLY_LABEL_TEXT } from "@/lib/constants";
import { listQueue, recentlyCompleted } from "./actions";
import { overview } from "./stats";

/** The daily status Instinct texts the team. Plain text on purpose. */
export async function dailySummary() {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 3600_000);
  const done = await recentlyCompleted(24);
  const replies = await db
    .select({ tp: schema.touchpoints, lead: schema.leads })
    .from(schema.touchpoints)
    .innerJoin(schema.leads, eq(schema.touchpoints.leadId, schema.leads.id))
    .where(and(eq(schema.touchpoints.direction, "in"), ne(schema.touchpoints.kind, "connection_accepted"), gte(schema.touchpoints.occurredAt, since), isNull(schema.touchpoints.deletedAt)))
    .orderBy(desc(schema.touchpoints.occurredAt));
  const added = await db
    .select({ n: schema.leads.id })
    .from(schema.leads)
    .where(and(gte(schema.leads.createdAt, since), isNull(schema.leads.deletedAt)));
  const queue = await listQueue();
  const ov = await overview();

  const byAssignee = new Map<string, number>();
  for (const q of queue) byAssignee.set(q.action.assignee, (byAssignee.get(q.action.assignee) ?? 0) + 1);
  const needsPeople = queue.filter((q) => q.action.type === "respond");

  const lines = [
    `Deskshift outreach, last 24h`,
    `- ${added.length} new leads, ${done.filter((d) => d.action.status === "done").length} tasks done, ${replies.length} replies`,
    ...replies.slice(0, 8).map(
      (r) =>
        `  • ${r.lead.fullName} replied on ${CHANNEL_LABEL[r.tp.channel] ?? r.tp.channel}${r.tp.replyLabel ? ` (${REPLY_LABEL_TEXT[r.tp.replyLabel]})` : ""}${r.tp.content ? `: "${r.tp.content.slice(0, 80)}"` : ""}`,
    ),
    `Today: ${queue.length} tasks (${[...byAssignee.entries()].map(([a, n]) => `${a} ${n}`).join(", ") || "none"})`,
    needsPeople.length
      ? `Needs you: ${needsPeople.map((q) => `${q.lead.fullName} (${ACTION_LABEL[q.action.type]})`).join(", ")}`
      : `Nothing waiting on you.`,
    `30-day reply rate: ${ov.replyRate30 === null ? "n/a" : Math.round(ov.replyRate30 * 100) + "%"} (${ov.replied30}/${ov.contacted30})`,
  ];
  return {
    text: lines.join("\n"),
    added: added.length,
    done: done.length,
    replies: replies.length,
    queue: queue.length,
    needsPeople: needsPeople.length,
  };
}
