import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CHANNELS } from "@/lib/constants";
import { defaultBatchName } from "./actions";
import { logTouchpoint } from "./touchpoints";
import { NotFound } from "./leads";

const SEND_TYPES = ["connect", "send_first", "follow_up", "respond"];

export function isSendTask(type: string) {
  return SEND_TYPES.includes(type);
}

/**
 * A person sent this task's message themselves (from their own LinkedIn or inbox).
 * Records it exactly like an agent send: on the timeline, in a batch, task closed,
 * stage and LinkedIn status updated.
 */
export async function markSent(
  actionId: string,
  actor: string,
  opts: { content?: string | null; subject?: string | null; batch?: string | null } = {},
) {
  const db = getDb();
  const [a] = await db.select().from(schema.actions).where(eq(schema.actions.id, actionId));
  if (!a) throw new NotFound("Task not found");
  if (a.status !== "pending") throw new Error("This task is already closed");
  const batch = opts.batch?.trim() || a.batch || defaultBatchName(a.channel);
  if (batch !== a.batch) {
    await db.update(schema.actions).set({ batch, updatedAt: new Date() }).where(eq(schema.actions.id, a.id));
  }
  const channel = ((CHANNELS as readonly string[]).includes(a.channel ?? "") ? a.channel : "linkedin") as (typeof CHANNELS)[number];
  return logTouchpoint(
    {
      leadId: a.leadId,
      actionId: a.id,
      channel,
      direction: "out",
      kind: a.type === "connect" ? "connection_request" : "message",
      content: opts.content ?? a.draft,
      subject: opts.subject ?? a.subject,
    },
    actor,
  );
}
