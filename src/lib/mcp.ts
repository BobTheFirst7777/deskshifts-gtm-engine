import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { CHANNELS, REPLY_LABELS, STAGES, TIERS, PRIORITIES, SIGNAL_TYPES } from "@/lib/constants";
import { addSignals, getLeadDetail, leadInput, listLeads, searchEverything, updateLead } from "@/lib/services/leads";
import { listQueue, setActionStatus, createAction, reviewQueue, selfSendQueue, writeDraft } from "@/lib/services/actions";
import { humanNames } from "@/lib/actors";
import { getSettings } from "@/lib/services/settings";
import { dailySummary } from "@/lib/services/summary";
import { overview, replyBreakdown } from "@/lib/services/stats";
import { createVariant, listVariants } from "@/lib/services/variants";
import { addLeads, leadRefInput, logForLead } from "@/lib/ops";
import { JOBS } from "@/lib/jobs";
import { agentBrief } from "@/lib/services/brief";
import { researchInput, researchQueue, saveResearch } from "@/lib/services/research";
import { batchResultsForAgents, latestInsights, recommendationInput, saveRecommendation } from "@/lib/services/batches";

const INSTRUCTIONS = `This is Deskshift's outbound engine: one shared record of every lead, message and reply.
- Start every session with get_brief: it says what we sell, who to find, the nightly routine, what's waiting, and the latest recommendations.
- If asked to "run the routine" (or similar), follow get_brief's workflow end to end without asking first.
- Before writing to someone, call search or get_lead to see their full history.
- Research new leads from get_research_queue and save it with save_research. Write messages for tasks in get_review_queue with write_draft. Nothing is sent until a person approves it.
- When you find good prospects, call add_leads (duplicates merge automatically; include whyRelevant and any signals with URLs).
- After you send a message or see a reply, call log_touchpoint. Replies stop automatic follow-ups.
- Fields the team edited by hand are protected; update_lead reports them as skipped. Don't fight that.
- Leads marked handsOff are handled personally by the team: don't message them.`;

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown) {
  const msg =
    e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const wrap =
  <A,>(fn: (args: A) => Promise<unknown>) =>
  async (args: A) => {
    try {
      return ok(await fn(args));
    } catch (e) {
      return fail(e);
    }
  };

/** Build an MCP handler that acts as the given agent. */
export function mcpHandlerFor(actor: string) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "get_brief",
        {
          title: "Get the brief",
          description:
            "Call this first. What Deskshift sells, who to look for and how, how many leads per night, the step-by-step workflow, what's waiting (to research / to approve), recent batch results and the latest recommendations.",
          inputSchema: z.object({}),
        },
        wrap(async () => agentBrief(actor)),
      );

      server.registerTool(
        "get_research_queue",
        {
          title: "Leads waiting for research",
          description: "New leads nobody has researched yet. Research each one (web, LinkedIn, company site) and save it with save_research.",
          inputSchema: z.object({ limit: z.number().int().max(100).optional() }),
        },
        wrap(async ({ limit }: { limit?: number }) =>
          (await researchQueue(limit ?? 25)).map((r) => ({
            leadId: r.lead.id,
            name: r.lead.fullName,
            title: r.lead.title,
            company: r.company?.name ?? null,
            website: r.company?.domain ?? null,
            linkedinUrl: r.lead.linkedinUrl,
            email: r.lead.email,
            source: r.lead.source,
            sourceDetail: r.lead.sourceDetail,
            notesSoFar: r.lead.whyRelevant ?? r.lead.notes,
          })),
        ),
      );

      server.registerTool(
        "save_research",
        {
          title: "Save research on a lead",
          description:
            "Save your research and drafts for one lead. Fills: how they relate to us, why now, what to pitch, importance 0-100, best channel, drafts (LinkedIn connection note < 300 chars, first message, email subject), signals with URLs, and any extra columns in customFields. The lead's first step (connection request or message) then appears on the Review & send page for approval. The team's own edits are never overwritten.",
          inputSchema: researchInput,
        },
        wrap(async (args: Record<string, unknown>) => saveResearch(args as never, actor)),
      );

      server.registerTool(
        "get_review_queue",
        {
          title: "Messages waiting for review",
          description:
            "Every outreach task waiting for the team's approval (and ones the team sends themselves), with the current draft and the lead's research. Use write_draft to write or improve each message.",
          inputSchema: z.object({ channel: z.enum(CHANNELS).optional() }),
        },
        wrap(async ({ channel }: { channel?: (typeof CHANNELS)[number] }) => {
          const rows = [...(await reviewQueue({ channel })), ...(await selfSendQueue(humanNames(), { channel }))];
          const { getLeadDetail } = await import("@/lib/services/leads");
          const out = [];
          for (const r of rows) {
            const d = await getLeadDetail(r.lead.id);
            out.push({
              taskId: r.action.id,
              task: r.action.type === "connect" ? "LinkedIn connection request note (max 300 chars)" : r.action.type === "follow_up" ? "follow-up message" : "first message",
              channel: r.action.channel,
              sentBy: r.action.assignee === "instinct" ? "Instinct, after approval" : `${r.action.assignee} (by hand)`,
              currentDraft: r.action.draft,
              currentSubject: r.action.subject,
              draftEditedByTeam: r.action.manualFields.includes("draft"),
              reason: r.action.reason,
              lead: {
                name: r.lead.fullName,
                title: r.lead.title,
                company: r.company?.name ?? null,
                linkedinUrl: r.lead.linkedinUrl,
                linkedin: r.lead.linkedinStatus ?? "not connected",
                relation: r.lead.relation,
                whyNow: r.lead.whyRelevant,
                pitch: r.lead.pitchAngle,
                segment: r.lead.segment,
                extra: r.lead.customFields,
                signals: d?.signals.map((s) => ({ summary: s.summary, url: s.url })) ?? [],
                connectionNoteSent: d?.touchpoints.find((t) => t.kind === "connection_request")?.content ?? null,
                conversation: d?.touchpoints
                  .filter((t) => t.kind !== "note")
                  .slice(0, 6)
                  .map((t) => ({ from: t.direction === "out" ? "us" : "them", kind: t.kind, text: t.content, at: t.occurredAt })),
              },
            });
          }
          return out;
        }),
      );

      server.registerTool(
        "write_draft",
        {
          title: "Write a message for a task",
          description:
            "Write or replace the draft for a task from get_review_queue. Connection notes must be 300 characters or fewer. Approved tasks can't be changed, and drafts the team edited are kept.",
          inputSchema: z.object({
            taskId: z.string(),
            draft: z.string().min(1),
            subject: z.string().optional().describe("Email subject, for email tasks"),
          }),
        },
        wrap(async ({ taskId, draft, subject }: { taskId: string; draft: string; subject?: string }) => {
          const s = await getSettings();
          if (s.draftWriter === "chatgpt" && actor !== "chatgpt") {
            throw new Error("The team has set ChatGPT to write all messages. Leave drafts to ChatGPT.");
          }
          return writeDraft(taskId, { draft, subject }, actor);
        }),
      );

      server.registerTool(
        "get_batch_results",
        {
          title: "Batch results",
          description:
            "Without a name: recent batches with sent / accepted / replied counts. With a batch name: every person in it, what was sent, whether they accepted or replied, their reply text, and days waiting.",
          inputSchema: z.object({ batch: z.string().optional() }),
        },
        wrap(async ({ batch }: { batch?: string }) => batchResultsForAgents(batch)),
      );

      server.registerTool(
        "save_recommendations",
        {
          title: "Save recommendations",
          description:
            "Write what worked, what didn't (with numbers) and what to change next: segments, channels, angles, message wording. Shown to the team on Insights and given to every agent in get_brief.",
          inputSchema: recommendationInput,
        },
        wrap(async (args: { title: string; body: string; batch?: string | null }) => saveRecommendation(args, actor)),
      );

      server.registerTool(
        "get_recommendations",
        { title: "Latest recommendations", description: "The most recent recommendations and weekly reviews.", inputSchema: z.object({}) },
        wrap(async () => latestInsights(5)),
      );

      server.registerTool(
        "search",
        {
          title: "Search leads and companies",
          description: "Find people or companies by name, domain, email or LinkedIn and return their full history: signals, every message and reply, and open tasks.",
          inputSchema: z.object({ q: z.string().describe("e.g. 'decagon' or 'priya'") }),
        },
        wrap(async ({ q }: { q: string }) => searchEverything(q, 8)),
      );

      server.registerTool(
        "list_leads",
        {
          title: "List leads",
          description: "List leads with filters. Sort by score to see the best ones.",
          inputSchema: z.object({
            q: z.string().optional(),
            stage: z.enum(STAGES).optional(),
            tier: z.enum(TIERS).optional(),
            source: z.string().optional(),
            sort: z.enum(["recent", "score", "touched"]).optional(),
            limit: z.number().int().max(200).optional(),
          }),
        },
        wrap(async (f: { q?: string; stage?: string; tier?: string; source?: string; sort?: "score" | "recent" | "touched"; limit?: number }) => {
          const rows = await listLeads({ ...f, limit: f.limit ?? 50 });
          return rows.map((r) => ({
            id: r.lead.id,
            name: r.lead.fullName,
            title: r.lead.title,
            company: r.company?.name ?? null,
            stage: r.lead.stage,
            tier: r.lead.tier,
            score: r.lead.score,
            source: r.lead.source,
            bestChannel: r.lead.bestChannel,
            handsOff: r.lead.handsOff,
            lastTouchAt: r.lead.lastTouchAt,
            linkedinUrl: r.lead.linkedinUrl,
            email: r.lead.email,
          }));
        }),
      );

      server.registerTool(
        "get_lead",
        {
          title: "Get a lead",
          description: "Full record for one lead: company, signals, timeline of messages and replies, tasks.",
          inputSchema: z.object({ id: z.string() }),
        },
        wrap(async ({ id }: { id: string }) => (await getLeadDetail(id)) ?? { error: "not found" }),
      );

      server.registerTool(
        "add_leads",
        {
          title: "Add leads",
          description:
            "Add prospects you found (from Apollo, LinkedIn, events, the web) with the basics: name, title, company, website, LinkedIn URL, email if public, and where you found them (sourceDetail). They arrive as New; research them next with save_research. Duplicates are merged, never doubled. Stage, hands-off and owner are set by the team only.",
          inputSchema: z.object({ leads: z.array(leadInput).min(1).max(100) }),
        },
        wrap(async ({ leads }: { leads: unknown[] }) => addLeads(leads, actor)),
      );

      server.registerTool(
        "update_lead",
        {
          title: "Update a lead",
          description:
            "Change fields on a lead. Fields the team set by hand are protected and come back as skipped. Hands-off and owner can only be set by the team; to mark a lead researched, use save_research.",
          inputSchema: z.object({
            id: z.string(),
            fields: z.object({
              stage: z.enum(STAGES).optional(),
              tier: z.enum(TIERS).optional(),
              score: z.number().int().min(0).max(100).optional(),
              priority: z.enum(PRIORITIES).optional(),
              whyRelevant: z.string().optional(),
              bestChannel: z.enum(CHANNELS).optional(),
              title: z.string().optional(),
              email: z.string().optional(),
              phone: z.string().optional(),
              linkedinUrl: z.string().optional(),
              segment: z.string().optional(),
              notes: z.string().optional(),
              relation: z.string().optional(),
              pitchAngle: z.string().optional(),
              connectionNote: z.string().max(300).optional().describe("Used for the next connection request"),
              draftMessage: z.string().optional().describe("Used for the first message after they accept"),
              emailSubject: z.string().optional(),
            }),
          }),
        },
        wrap(async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => updateLead(id, fields, actor)),
      );

      server.registerTool(
        "add_signals",
        {
          title: "Add signals",
          description: "Attach buying signals you found (funding, a post about support pain, hiring, an event) with source URLs.",
          inputSchema: z.object({
            leadId: z.string(),
            signals: z.array(z.object({ type: z.enum(SIGNAL_TYPES), summary: z.string(), url: z.string().optional() })),
          }),
        },
        wrap(async ({ leadId, signals }: { leadId: string; signals: { type: string; summary: string; url?: string }[] }) => addSignals(leadId, signals as never, actor)),
      );

      server.registerTool(
        "log_touchpoint",
        {
          title: "Log a message, reply, call, meeting or note",
          description:
            "Record outreach. direction 'out' = we sent it; 'in' = they replied or accepted. Pass leadId, or lead {linkedinUrl|email|name}, and taskId as actionId when you're doing a task. Replies stop automatic follow-ups and alert the team; an accepted connection queues the first message for review.",
          inputSchema: z.object({
            leadId: z.string().optional(),
            lead: leadRefInput.optional(),
            channel: z.enum(CHANNELS),
            direction: z.enum(["out", "in"]),
            kind: z
              .enum(["message", "connection_request", "connection_accepted", "call", "meeting", "note"])
              .optional()
              .describe("connection_request when you send a LinkedIn invite; connection_accepted (direction in) when they accept"),
            content: z.string().optional().describe("Exact text sent or received"),
            replyLabel: z.enum(REPLY_LABELS).optional(),
            actionId: z.string().optional().describe("The task this fulfils, if any"),
          }),
        },
        wrap(async (args: Record<string, unknown>) => logForLead(args, actor)),
      );

      server.registerTool(
        "get_today_queue",
        {
          title: "Today's tasks",
          description: "Today's outreach tasks with drafts, highest priority first. Filter by assignee (instinct, ishan, tanzil).",
          inputSchema: z.object({ assignee: z.string().optional() }),
        },
        wrap(async ({ assignee }: { assignee?: string }) =>
          (await listQueue({ assignee })).map((r) => ({
            taskId: r.action.id,
            type: r.action.type,
            channel: r.action.channel,
            assignee: r.action.assignee,
            priority: r.action.priority,
            draft: r.action.draft,
            reason: r.action.reason,
            lead: {
              id: r.lead.id,
              name: r.lead.fullName,
              title: r.lead.title,
              company: r.company?.name ?? null,
              linkedinUrl: r.lead.linkedinUrl,
              email: r.lead.email,
              whyRelevant: r.lead.whyRelevant,
            },
          })),
        ),
      );

      server.registerTool(
        "update_task",
        {
          title: "Update a task",
          description: "Mark a task done or skipped, or improve its draft.",
          inputSchema: z.object({
            taskId: z.string(),
            status: z.enum(["done", "skipped", "pending"]).optional(),
            note: z.string().optional(),
            draft: z.string().optional(),
          }),
        },
        wrap(async ({ taskId, status, note, draft }: { taskId: string; status?: "done" | "skipped" | "pending"; note?: string; draft?: string }) => {
          if (draft !== undefined) await writeDraft(taskId, { draft }, actor);
          if (status) return setActionStatus(taskId, status, actor, note);
          return { ok: true };
        }),
      );

      server.registerTool(
        "create_task",
        {
          title: "Create a task",
          description: "Schedule a task for a lead (e.g. a call, or a follow-up on a date).",
          inputSchema: z.object({
            leadId: z.string(),
            type: z.enum(["send_first", "follow_up", "respond", "connect", "call", "research", "custom"]),
            channel: z.enum(CHANNELS).optional(),
            assignee: z.string().optional(),
            dueAt: z.string().optional().describe("ISO date"),
            draft: z.string().optional(),
            reason: z.string().optional(),
          }),
        },
        wrap(async (args: Record<string, unknown>) => createAction(args as never, actor)),
      );

      server.registerTool(
        "daily_summary",
        { title: "Daily summary", description: "What happened in the last 24 hours and what's on today.", inputSchema: z.object({}) },
        wrap(async () => dailySummary()),
      );

      server.registerTool(
        "get_stats",
        {
          title: "Outreach stats",
          description: "Reply rates by message version, channel, segment, tier and source. Use this to decide what to send next.",
          inputSchema: z.object({}),
        },
        wrap(async () => ({
          overview: await overview(),
          byVariant: await replyBreakdown("variant"),
          byChannel: await replyBreakdown("channel"),
          bySegment: await replyBreakdown("segment"),
          byTier: await replyBreakdown("tier"),
        })),
      );

      server.registerTool(
        "message_versions",
        {
          title: "Message versions",
          description: "List message versions (for A/B testing), or add a new one by passing name and body.",
          inputSchema: z.object({
            name: z.string().optional(),
            body: z.string().optional(),
            angle: z.string().optional(),
            segment: z.string().optional(),
            channel: z.enum(CHANNELS).optional(),
          }),
        },
        wrap(async (a: { name?: string; body?: string; angle?: string; segment?: string; channel?: (typeof CHANNELS)[number] }) => {
          if (a.name && a.body) return createVariant({ ...a, name: a.name, body: a.body }, actor);
          return listVariants();
        }),
      );

      server.registerTool(
        "run_job",
        {
          title: "Run a job now",
          description: "research = research unresearched leads; queue = build today's tasks; weekly = write the weekly review.",
          inputSchema: z.object({ job: z.enum(["research", "queue", "weekly"]) }),
        },
        wrap(async ({ job }: { job: "research" | "queue" | "weekly" }) => JOBS[job]()),
      );
    },
    {
      serverInfo: { name: "deskshift-gtm", version: "1.0.0" },
      instructions: INSTRUCTIONS,
    },
  );
}
