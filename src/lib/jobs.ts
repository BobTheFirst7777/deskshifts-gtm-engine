import { and, asc, isNull, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { aiEnabled, draftFollowUp, logAiError, researchLead, writeWeeklyReview } from "@/lib/ai";
import { buildDailyQueue } from "@/lib/services/queue";
import { runWeeklyReview } from "@/lib/services/weekly";
import { getSettings } from "@/lib/services/settings";

/** Research leads that haven't been researched yet. */
export async function runResearchJob(limit = 15) {
  if (!aiEnabled()) return { researched: 0, skipped: "OPENAI_API_KEY not set" };
  const settings = await getSettings();
  if (settings.automationPaused) return { researched: 0, skipped: "automation paused" };
  const db = getDb();
  const todo = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(isNull(schema.leads.researchedAt), isNull(schema.leads.deletedAt), inArray(schema.leads.stage, ["new", "researched"])))
    .orderBy(asc(schema.leads.createdAt))
    .limit(limit);
  let researched = 0;
  const errors: string[] = [];
  for (const { id } of todo) {
    try {
      const r = await researchLead(id);
      if (r.ok) researched++;
    } catch (e) {
      errors.push((e as Error).message);
      await logAiError("research", e);
    }
  }
  return { researched, remaining: Math.max(0, todo.length - researched), errors };
}

export async function runQueueJob() {
  const ai = aiEnabled();
  return buildDailyQueue({ draft: ai ? draftFollowUp : undefined });
}

export async function runWeeklyJob() {
  const row = await runWeeklyReview(aiEnabled() ? writeWeeklyReview : undefined);
  return { insightId: row.id, title: row.title };
}

export const JOBS = { research: runResearchJob, queue: runQueueJob, weekly: runWeeklyJob } as const;
export type JobName = keyof typeof JOBS;
