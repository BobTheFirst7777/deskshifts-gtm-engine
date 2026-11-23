import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { CHANNELS, PRIORITIES, SIGNAL_TYPES, TIERS } from "@/lib/constants";
import { record } from "./activity";
import { addSignals, getLead, getLeadDetail, NotFound, updateCompany, updateLead } from "./leads";
import { queueFirstTouch } from "./queue";
import { getSettings } from "./settings";
import { isHuman } from "@/lib/actors";

/** New leads that no agent has researched yet, oldest first. */
export async function researchQueue(limit = 25) {
  const db = getDb();
  return db
    .select({ lead: schema.leads, company: schema.companies })
    .from(schema.leads)
    .leftJoin(schema.companies, eq(schema.leads.companyId, schema.companies.id))
    .where(
      and(
        isNull(schema.leads.researchedAt),
        isNull(schema.leads.deletedAt),
        eq(schema.leads.paused, false),
        inArray(schema.leads.stage, ["new", "researched"]),
      ),
    )
    .orderBy(asc(schema.leads.createdAt))
    .limit(limit);
}

export const researchInput = z.object({
  leadId: z.string().uuid(),
  relation: z.string().describe("How this company and person relate to Deskshift: their product, users and the problem Dex solves for them"),
  whyRelevant: z.string().describe("Why reach out now: the specific trigger or signal"),
  pitchAngle: z.string().describe("What to target them for: the Dex use case or angle to lead with"),
  importance: z.coerce.number().int().min(0).max(100).describe("How important / good a fit, 0-100. 80+ = top priority"),
  priority: z.enum(PRIORITIES).nullish(),
  tier: z.enum(TIERS).nullish(),
  bestChannel: z.enum(CHANNELS).describe("linkedin or email usually"),
  segment: z.string().nullish(),
  connectionNote: z.string().max(300).nullish().describe("LinkedIn connection request note, under 300 characters. Needed if bestChannel is linkedin and you're not connected"),
  draftMessage: z.string().nullish().describe("First message: the LinkedIn message to send once connected, or the email body"),
  emailSubject: z.string().nullish(),
  title: z.string().nullish(),
  email: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  linkedinConnected: z.boolean().nullish().describe("true if we're already connected on LinkedIn"),
  customFields: z.record(z.string(), z.string()).nullish().describe("Any extra columns you find useful"),
  signals: z
    .array(z.object({ type: z.enum(SIGNAL_TYPES).catch("other"), summary: z.string(), url: z.string().nullish() }))
    .nullish(),
  company: z
    .object({
      description: z.string().nullish(),
      industry: z.string().nullish(),
      size: z.string().nullish(),
      fundingStage: z.string().nullish(),
      domain: z.string().nullish(),
    })
    .nullish(),
});
export type ResearchInput = z.input<typeof researchInput>;

/**
 * Save an agent's research on a lead. Fills the research columns (never over a
 * person's own edits), adds signals, marks the lead researched, and puts its first
 * outreach step (connection request or message) up for review.
 */
export async function saveResearch(raw: ResearchInput, actor: string) {
  const r = researchInput.parse(raw);
  const lead = await getLead(r.leadId);
  if (!lead || lead.deletedAt) throw new NotFound("Lead not found");

  const patch: Record<string, unknown> = {
    relation: r.relation,
    whyRelevant: r.whyRelevant,
    pitchAngle: r.pitchAngle,
    score: r.importance,
    priority: r.priority ?? (r.importance >= 80 ? "high" : r.importance >= 55 ? "medium" : "low"),
    bestChannel: r.bestChannel,
  };
  const settings = await getSettings();
  const mayWrite = settings.draftWriter === "any" || actor === "chatgpt" || isHuman(actor);
  for (const k of ["tier", "segment", "connectionNote", "draftMessage", "emailSubject", "title", "email", "linkedinUrl"] as const) {
    if (!mayWrite && (k === "connectionNote" || k === "draftMessage" || k === "emailSubject")) continue;
    if (r[k]) patch[k] = r[k];
  }
  if (r.customFields && Object.keys(r.customFields).length) patch.customFields = r.customFields;
  if (r.linkedinConnected) patch.linkedinStatus = "connected";
  if (lead.stage === "new" || lead.stage === "researched") patch.stage = "researched";

  const res = await updateLead(lead.id, patch, actor, { research: true });
  await getDb()
    .update(schema.leads)
    .set({ researchedAt: new Date(), researchedBy: actor })
    .where(eq(schema.leads.id, lead.id));

  if (r.signals?.length) await addSignals(lead.id, r.signals, actor);
  if (r.company && lead.companyId) {
    const d = await getLeadDetail(lead.id);
    const c = d?.company;
    if (c) {
      const fill = Object.fromEntries(
        Object.entries(r.company).filter(([k, v]) => v && !(c as Record<string, unknown>)[k]),
      );
      if (Object.keys(fill).length) await updateCompany(c.id, fill, actor);
    }
  }
  await record({
    actor,
    entityType: "lead",
    entityId: lead.id,
    action: "update",
    summary: `${actor} researched ${lead.fullName} (importance ${r.importance})`,
  });

  const queued = await queueFirstTouch(lead.id);
  return {
    leadId: lead.id,
    saved: res.changed,
    keptTeamValues: res.skipped,
    queued: queued ? { type: queued.type, channel: queued.channel, taskId: queued.id } : null,
  };
}
