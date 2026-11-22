import { generateText, Output, isStepCount } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { CHANNELS, PRIORITIES, SIGNAL_TYPES, TIERS, REPLY_LABELS } from "@/lib/constants";
import { getSettings } from "@/lib/services/settings";
import { addSignals, getLeadDetail, updateCompany, updateLead, type LeadDetail } from "@/lib/services/leads";
import { listVariants } from "@/lib/services/variants";
import { record } from "@/lib/services/activity";

export function aiEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function openai() {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Fast model for parsing and drafting; smart model for research and weekly review. */
const fastModel = () => openai()(process.env.OPENAI_MODEL || "gpt-5.4-mini");
const smartModel = () => openai()(process.env.OPENAI_SMART_MODEL || process.env.OPENAI_MODEL || "gpt-5.5");

// ------------------------------------------------------------------ research

const researchSchema = z.object({
  whyRelevant: z.string().describe("2-3 sentences: why this person/company needs Deskshift now. Specific, no fluff."),
  score: z.number().int().min(0).max(100).describe("Fit and timing, 0-100. 80+ means reach out this week."),
  tier: z.enum(TIERS),
  priority: z.enum(PRIORITIES),
  bestChannel: z.enum(CHANNELS),
  segment: z.string().describe("Short segment label, e.g. 'Seed devtools', 'Series B fintech'."),
  signals: z
    .array(
      z.object({
        type: z.enum(SIGNAL_TYPES),
        summary: z.string(),
        url: z.string().nullable(),
      }),
    )
    .describe("Concrete, recent, sourced signals only. Empty if none found."),
  draftMessage: z.string().describe("First message for the best channel. Under 90 words, plain, specific to them."),
  variantId: z.string().nullable().describe("id of the message version used as the base, or null"),
  company: z.object({
    industry: z.string().nullable(),
    size: z.string().nullable(),
    fundingStage: z.string().nullable(),
    description: z.string().nullable(),
  }),
});

function leadBrief(d: LeadDetail) {
  const l = d.lead;
  return [
    `Name: ${l.fullName}`,
    l.title && `Title: ${l.title}`,
    d.company && `Company: ${d.company.name}${d.company.domain ? ` (${d.company.domain})` : ""}`,
    d.company?.description && `Company description: ${d.company.description}`,
    l.linkedinUrl && `LinkedIn: ${l.linkedinUrl}`,
    l.location && `Location: ${l.location}`,
    d.event && `Met / found at event: ${d.event.name}`,
    l.source && `Source: ${l.source}${l.sourceDetail ? ` — ${l.sourceDetail}` : ""}`,
    l.whyRelevant && `Existing notes on relevance: ${l.whyRelevant}`,
    l.notes && `Notes: ${l.notes}`,
    d.signals.length && `Known signals:\n${d.signals.map((s) => `- ${s.summary}${s.url ? ` (${s.url})` : ""}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function latestInsight() {
  const db = getDb();
  const [i] = await db.select().from(schema.insights).orderBy(desc(schema.insights.createdAt)).limit(1);
  return i?.body ?? null;
}

/** Research one lead with web search, then score it and draft the first message. */
export async function researchLead(leadId: string) {
  if (!aiEnabled()) return { ok: false, reason: "OPENAI_API_KEY not set" };
  const d = await getLeadDetail(leadId);
  if (!d) return { ok: false, reason: "not found" };
  const settings = await getSettings();
  const variants = await listVariants(true);
  const insight = await latestInsight();

  const { output } = await generateText({
    model: smartModel(),
    tools: { web_search: openai().tools.webSearch({ searchContextSize: "medium" }) },
    stopWhen: isStepCount(6),
    output: Output.object({ schema: researchSchema }),
    system: [
      "You are the research analyst for Deskshift's outbound engine.",
      `What we sell: ${settings.pitch}`,
      `Ideal customer: ${settings.icp}`,
      "Research the person and company on the web: product, funding, hiring, recent posts or launches, anything showing onboarding/support/demo pain.",
      "Only report signals you actually found, with a source URL. Never invent facts.",
      "Write the draft like a founder, not a marketer: one specific observation about them, one line on Dex, one easy ask. No buzzwords.",
      variants.length
        ? `Message versions you can base the draft on (return its id as variantId):\n${variants.map((v) => `[${v.id}] ${v.name}${v.segment ? ` (for ${v.segment})` : ""}: ${v.body}`).join("\n")}`
        : "There are no saved message versions yet; write from scratch and return variantId null.",
      insight ? `What has been working lately:\n${insight.slice(0, 1500)}` : "",
    ].join("\n\n"),
    prompt: `Research this lead and fill every field.\n\n${leadBrief(d)}`,
  });

  const r = output;
  const variantOk = r.variantId && variants.some((v) => v.id === r.variantId) ? r.variantId : null;
  await updateLead(
    leadId,
    {
      whyRelevant: r.whyRelevant,
      score: r.score,
      tier: d.lead.tier === "event" && r.tier === "standard" ? "event" : r.tier,
      priority: r.priority,
      bestChannel: r.bestChannel,
      segment: r.segment,
      draftMessage: r.draftMessage,
      variantId: variantOk,
      ...(d.lead.stage === "new" ? { stage: "researched" as const } : {}),
    },
    "system",
  );
  await getDb().update(schema.leads).set({ researchedAt: new Date() }).where(eq(schema.leads.id, leadId));
  if (r.signals.length) await addSignals(leadId, r.signals, "system");
  if (d.company) {
    await updateCompany(
      d.company.id,
      Object.fromEntries(
        Object.entries(r.company).filter(([k, v]) => v && !(d.company as Record<string, unknown>)[k]),
      ),
      "system",
    );
  }
  return { ok: true, score: r.score };
}

// ------------------------------------------------------------------ drafting

export async function draftFollowUp(leadId: string, followUpNumber: number) {
  if (!aiEnabled()) return null;
  const d = await getLeadDetail(leadId);
  if (!d) return null;
  const settings = await getSettings();
  const insight = await latestInsight();
  const thread = [...d.touchpoints]
    .reverse()
    .filter((t) => t.kind !== "note")
    .map((t) => `${t.direction === "out" ? "We" : "They"} (${t.channel}, ${t.occurredAt.toISOString().slice(0, 10)}): ${t.content ?? "(no text logged)"}`)
    .join("\n");
  const { text } = await generateText({
    model: fastModel(),
    system: [
      `You write follow-ups for Deskshift. ${settings.pitch}`,
      "The lead has not replied. Write follow-up #" + followUpNumber + ". Under 60 words.",
      "Use a NEW angle from their signals or a different pain point; never just 'bumping this'. One easy ask.",
      insight ? `What has been working lately:\n${insight.slice(0, 1000)}` : "",
      "Return only the message text.",
    ].join("\n\n"),
    prompt: `${leadBrief(d)}\n\nThread so far:\n${thread || "(none logged)"}`,
  });
  return text.trim();
}

// ------------------------------------------------------------------ agent updates in plain English

const leadRef = z.object({
  name: z.string().nullable(),
  company: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  email: z.string().nullable(),
});

export const agentOpSchema = z.object({
  ops: z.array(
    z.object({
      type: z.enum(["add_lead", "log_sent", "log_reply", "log_call_or_meeting", "add_note", "update_lead", "add_signal", "skip_action"]),
      lead: leadRef,
      actionId: z.string().nullable(),
      channel: z.enum(CHANNELS).nullable(),
      content: z.string().nullable().describe("Exact message text sent or received, if given"),
      replyLabel: z.enum(REPLY_LABELS).nullable(),
      newLead: z
        .object({
          title: z.string().nullable(),
          phone: z.string().nullable(),
          location: z.string().nullable(),
          companyDomain: z.string().nullable(),
          whyRelevant: z.string().nullable(),
          sourceDetail: z.string().nullable(),
          event: z.string().nullable(),
        })
        .nullable(),
      updates: z
        .object({
          stage: z.enum(["new", "researched", "contacted", "replied", "meeting", "won", "lost", "nurture"]).nullable(),
          bestChannel: z.enum(CHANNELS).nullable(),
          handsOff: z.boolean().nullable(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
          title: z.string().nullable(),
        })
        .nullable(),
      signal: z.object({ type: z.enum(SIGNAL_TYPES), summary: z.string(), url: z.string().nullable() }).nullable(),
      reason: z.string().nullable(),
    }),
  ),
  unclear: z.array(z.string()).describe("Anything you could not map to an operation"),
});
export type AgentOps = z.infer<typeof agentOpSchema>;

export async function parseAgentText(text: string): Promise<AgentOps> {
  if (!aiEnabled()) throw new Error("OPENAI_API_KEY is not set, so plain-English updates can't be parsed. Use the structured forms instead.");
  const { output } = await generateText({
    model: fastModel(),
    output: Output.object({ schema: agentOpSchema }),
    system: [
      "Convert an outreach agent's plain-English status update into operations for a CRM.",
      "One operation per thing that happened. Keep message text verbatim in content.",
      "log_sent = we sent a message or connection request. log_reply = they replied (pick the best replyLabel).",
      "add_lead = a new person to track. update_lead = change a field. add_note = anything else worth keeping.",
      "If an action id like 'A-1234abcd' or a UUID is mentioned, put it in actionId.",
      "Use null for anything not stated. Never invent people, emails or URLs.",
    ].join("\n"),
    prompt: text,
  });
  return output;
}

// ------------------------------------------------------------------ weekly review

export async function writeWeeklyReview(stats: Record<string, unknown>, sampleReplies: string[]) {
  if (!aiEnabled()) return null;
  const settings = await getSettings();
  const { text } = await generateText({
    model: smartModel(),
    system: [
      `You are reviewing a week of outbound for Deskshift. ${settings.pitch}`,
      "Write a short markdown review: 1) what is working (with numbers), 2) what isn't, 3) three concrete changes for next week (which segments, channels and message angles to push or drop), 4) one new message version to test, written out.",
      "Be specific and honest; small samples should be called small. Under 300 words.",
    ].join("\n"),
    prompt: `Stats (JSON):\n${JSON.stringify(stats, null, 2)}\n\nRecent replies:\n${sampleReplies.join("\n---\n") || "(none)"}`,
  });
  return text.trim();
}

export async function logAiError(where: string, err: unknown) {
  console.error(`[ai:${where}]`, err);
  await record({
    actor: "system",
    entityType: "settings",
    entityId: "00000000-0000-0000-0000-000000000000",
    action: "update",
    summary: `AI ${where} failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
  }).catch(() => {});
}
