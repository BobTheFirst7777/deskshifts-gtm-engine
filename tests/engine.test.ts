import { beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { setDb, getDb, type DB } from "@/lib/db";
import { addLead, updateLead, getLeadDetail, listLeads, normalizeLinkedin, searchEverything } from "@/lib/services/leads";
import { logTouchpoint } from "@/lib/services/touchpoints";
import { buildDailyQueue } from "@/lib/services/queue";
import { listQueue, setActionStatus } from "@/lib/services/actions";
import { recentActivity } from "@/lib/services/activity";
import { revertActivity } from "@/lib/services/revert";
import { executeAgentOps } from "@/lib/services/agent-ops";
import { overview, replyBreakdown } from "@/lib/services/stats";
import { runWeeklyReview } from "@/lib/services/weekly";
import { updateSettings } from "@/lib/services/settings";

beforeAll(async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(__dirname, "..", "drizzle") });
  setDb(db as unknown as DB);
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

async function quickResearch(leadId: string, channel: "email" | "linkedin", actor: string, importance: number) {
  const { saveResearch: save } = await import("@/lib/services/research");
  return save({ leadId, relation: "Fits", whyRelevant: "Signal", pitchAngle: "Angle", importance, bestChannel: channel, draftMessage: "Hello" }, actor);
}

describe("leads", () => {
  it("normalises LinkedIn URLs", () => {
    expect(normalizeLinkedin("http://linkedin.com/in/Priya-S/?utm=1")).toBe("https://www.linkedin.com/in/priya-s");
    expect(normalizeLinkedin("https://in.linkedin.com/in/priya-s/")).toBe("https://www.linkedin.com/in/priya-s");
  });

  it("dedupes across sources and fills gaps without overwriting", async () => {
    const a = await addLead(
      { fullName: "Priya Shah", company: "Acme", companyDomain: "acme.io", linkedinUrl: "linkedin.com/in/priya-s" },
      "chatgpt",
    );
    expect(a.created).toBe(true);
    expect(a.lead.source).toBe("chatgpt");

    const b = await addLead(
      { fullName: "Priya Shah", linkedinUrl: "https://www.linkedin.com/in/priya-s/", title: "Head of CS", email: "Priya@Acme.io" },
      "instinct",
    );
    expect(b.created).toBe(false);
    expect(b.lead.id).toBe(a.lead.id);
    expect(b.filled).toEqual(expect.arrayContaining(["title", "email"]));
    expect(b.lead.email).toBe("priya@acme.io");
  });

  it("keeps a person's edits safe from agents and jobs", async () => {
    const [{ lead }] = await listLeads({ q: "Priya" });
    await updateLead(lead.id, { whyRelevant: "Ishan met her at the SaaStr dinner" }, "ishan");
    const r = await updateLead(lead.id, { whyRelevant: "AI guess", score: 77 }, "system");
    expect(r.skipped).toEqual(["whyRelevant"]);
    expect(r.lead.whyRelevant).toBe("Ishan met her at the SaaStr dinner");
    expect(r.lead.score).toBe(77);
  });

  it("finds everything about a company in one search", async () => {
    const res = await searchEverything("acme");
    expect(res.length).toBe(1);
    expect(res[0].company?.domain).toBe("acme.io");
  });
});

describe("queue and follow-up loop", () => {
  it("queues first messages, respecting hands-off", async () => {
    const auto = await addLead({ fullName: "Ben Ortiz", company: "Decagon-ish", email: "ben@d.io" }, "claude");
    await quickResearch(auto.lead.id, "email", "claude", 90);
    const manual = await addLead({ fullName: "Sara Lim", company: "Flowly", stage: "researched", score: 60, handsOff: true }, "ishan");

    const res = await buildDailyQueue();
    expect(res.firstTouches).toBeGreaterThanOrEqual(1); // Ben was already queued the moment research was saved

    const q = await listQueue();
    const ben = q.find((r) => r.lead.id === auto.lead.id)!;
    const sara = q.find((r) => r.lead.id === manual.lead.id)!;
    expect(ben.action.assignee).toBe("instinct");
    expect(ben.action.channel).toBe("email");
    expect(sara.action.assignee).toBe("ishan");

    // Instinct only sees its own work.
    const mine = await listQueue({ assignee: "instinct" });
    expect(mine.some((r) => r.lead.id === manual.lead.id)).toBe(false);
  });

  it("sending closes the task, then no reply creates a follow-up, then a reply stops it", async () => {
    const [{ lead }] = await listLeads({ q: "Ben Ortiz" });
    await logTouchpoint({ leadId: lead.id, channel: "email", direction: "out", content: "Hi Ben…", occurredAt: daysAgo(4) }, "instinct");

    let d = (await getLeadDetail(lead.id))!;
    expect(d.lead.stage).toBe("contacted");
    expect(d.actions.find((a) => a.type === "send_first")!.status).toBe("done");

    const drafts: number[] = [];
    const res = await buildDailyQueue({ draft: async (_id, n) => (drafts.push(n), `Follow-up ${n}`) });
    expect(res.followUps).toBe(1);
    expect(drafts).toEqual([1]);
    d = (await getLeadDetail(lead.id))!;
    const fu = d.actions.find((a) => a.type === "follow_up" && a.status === "pending")!;
    expect(fu.draft).toBe("Follow-up 1");

    // Running again the same day doesn't duplicate.
    const again = await buildDailyQueue();
    expect(again.followUps).toBe(0);

    await logTouchpoint({ leadId: lead.id, channel: "email", direction: "in", content: "Sure, Thursday?", replyLabel: "interested" }, "instinct");
    d = (await getLeadDetail(lead.id))!;
    expect(d.lead.stage).toBe("replied");
    expect(d.actions.find((a) => a.id === fu.id)!.status).toBe("cancelled");
    const respond = d.actions.find((a) => a.type === "respond")!;
    expect(respond.status).toBe("pending");
    expect(respond.assignee).toBe("ishan");
  });

  it("unsubscribe marks lost and clears the queue", async () => {
    const { lead } = await addLead({ fullName: "Tom Ng", company: "Quiet Co", stage: "researched", score: 50 }, "chatgpt");
    await buildDailyQueue();
    await logTouchpoint({ leadId: lead.id, channel: "linkedin", direction: "out" }, "instinct");
    await logTouchpoint({ leadId: lead.id, channel: "linkedin", direction: "in", replyLabel: "unsubscribe" }, "instinct");
    const d = (await getLeadDetail(lead.id))!;
    expect(d.lead.stage).toBe("lost");
    expect(d.actions.every((a) => a.status !== "pending")).toBe(true);
  });

  it("pausing automation stops the queue", async () => {
    await updateSettings({ automationPaused: true }, "ishan");
    expect((await buildDailyQueue()).paused).toBe(true);
    await updateSettings({ automationPaused: false }, "ishan");
  });

  it("paused leads drop out of today's list", async () => {
    const { lead } = await addLead({ fullName: "Paused Pat" }, "claude");
    await quickResearch(lead.id, "email", "claude", 99);
    expect((await listQueue()).some((r) => r.lead.id === lead.id)).toBe(true);
    await updateLead(lead.id, { paused: true }, "tanzil");
    expect((await listQueue()).some((r) => r.lead.id === lead.id)).toBe(false);
  });
});

describe("undo", () => {
  it("reverts a manual edit", async () => {
    const [{ lead }] = await listLeads({ q: "Priya" });
    await updateLead(lead.id, { title: "VP Support" }, "tanzil");
    const [entry] = (await recentActivity(5, lead.id)).filter((a) => a.summary?.includes("title"));
    await revertActivity(entry.id, "ishan");
    const d = (await getLeadDetail(lead.id))!;
    expect(d.lead.title).toBe("Head of CS");
  });

  it("reverts a completed task back to pending", async () => {
    const q = await listQueue();
    const a = q[0].action;
    await setActionStatus(a.id, "done", "ishan");
    const [entry] = await recentActivity(1, a.id);
    await revertActivity(entry.id, "ishan");
    const [row] = await getDb().select().from(schema.actions).where(eq(schema.actions.id, a.id));
    expect(row.status).toBe("pending");
  });
});

describe("agent updates", () => {
  it("executes parsed operations from Instinct", async () => {
    const results = await executeAgentOps(
      {
        ops: [
          {
            type: "add_lead",
            lead: { name: "Maya Chen", company: "Loopwise", linkedinUrl: "linkedin.com/in/mayachen", email: null },
            actionId: null, channel: null, content: null, replyLabel: null,
            newLead: { title: "CEO", phone: null, location: "SF", companyDomain: "loopwise.ai", whyRelevant: "Posted about onboarding drop-off", sourceDetail: "LinkedIn search", event: null },
            updates: null, signal: null, reason: null,
          },
          {
            type: "log_sent",
            lead: { name: "Maya Chen", company: null, linkedinUrl: null, email: null },
            actionId: null, channel: "linkedin", content: "Hey Maya, saw your post…", replyLabel: null,
            newLead: null, updates: null, signal: null, reason: null,
          },
          {
            type: "log_reply",
            lead: { name: "Nobody Real", company: null, linkedinUrl: null, email: null },
            actionId: null, channel: "linkedin", content: "?", replyLabel: null,
            newLead: null, updates: null, signal: null, reason: null,
          },
        ],
        unclear: [],
      },
      "instinct",
    );
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    expect(results[2].ok).toBe(false);
    const [{ lead }] = await listLeads({ q: "Maya" });
    expect(lead.source).toBe("instinct");
    expect(lead.stage).toBe("contacted");
  });
});

describe("stats", () => {
  it("computes overview, breakdowns and a weekly review", async () => {
    const ov = await overview();
    expect(ov.total).toBeGreaterThan(3);
    expect(ov.replied30).toBeGreaterThanOrEqual(1);
    const ch = await replyBreakdown("channel");
    expect(ch.find((r) => r.key === "email")?.replied).toBe(1);
    const review = await runWeeklyReview();
    expect(review.body).toContain("By channel");
  });
});

// ---------------------------------------------------------------- agent research → review → batches
import { researchQueue, saveResearch } from "@/lib/services/research";
import { approveActions, reviewQueue, selfSendQueue } from "@/lib/services/actions";
import { markSent } from "@/lib/services/sends";
import { batchDetail, listBatches, saveRecommendation } from "@/lib/services/batches";
import { queueFirstTouch } from "@/lib/services/queue";
import { agentBrief } from "@/lib/services/brief";
import { addLeads } from "@/lib/ops";

describe("agent research and the LinkedIn sequence", () => {
  it("runs research → connection request → accepted → message → reply, tracked by batch", async () => {
    await updateSettings({ draftWriter: "any" }, "ishan"); // let the researching agent write drafts here
    const { lead } = await addLead({ fullName: "Nina Park", company: "Cartwheel", linkedinUrl: "linkedin.com/in/ninapark" }, "chatgpt");
    expect((await researchQueue()).some((r) => r.lead.id === lead.id)).toBe(true);

    const saved = await saveResearch(
      {
        leadId: lead.id,
        relation: "Cartwheel's dashboard has 40 settings screens; new admins get lost.",
        whyRelevant: "Posted last week about onboarding tickets doubling.",
        pitchAngle: "Dex as the in-app onboarding guide for new admins",
        importance: 86,
        bestChannel: "linkedin",
        connectionNote: "Hi Nina, loved your post on onboarding tickets. Building something for exactly that, would love to connect.",
        draftMessage: "Thanks for connecting, Nina! Quick one: …",
        customFields: { "Support team size": "6" },
        signals: [{ type: "post", summary: "Onboarding tickets doubled", url: "https://linkedin.com/posts/x" }],
      },
      "instinct",
    );
    expect(saved.queued?.type).toBe("connect");
    expect((await researchQueue()).some((r) => r.lead.id === lead.id)).toBe(false);

    const review = await reviewQueue();
    const task = review.find((r) => r.lead.id === lead.id)!.action;
    expect(task.draft).toContain("loved your post");

    await approveActions([task.id], "ishan");
    const [approved] = await getDb().select().from(schema.actions).where(eq(schema.actions.id, task.id));
    expect(approved.batch).toMatch(/LinkedIn$/);

    await logTouchpoint({ leadId: lead.id, actionId: task.id, channel: "linkedin", direction: "out", kind: "connection_request", content: task.draft, occurredAt: daysAgo(5) }, "instinct");
    let d = (await getLeadDetail(lead.id))!;
    expect(d.lead.linkedinStatus).toBe("pending");
    expect(d.lead.stage).toBe("researched");
    expect(await queueFirstTouch(lead.id)).toBeNull(); // waiting for acceptance
    const fu = await buildDailyQueue();
    expect(fu.followUps).toBe(0); // no follow-up on a pending connection

    const acc = await logTouchpoint({ leadId: lead.id, channel: "linkedin", direction: "in", kind: "connection_accepted" }, "instinct");
    expect((acc as { queued?: { type: string } }).queued?.type).toBe("send_first");
    d = (await getLeadDetail(lead.id))!;
    expect(d.lead.linkedinStatus).toBe("connected");
    const msgTask = d.actions.find((a) => a.type === "send_first" && a.status === "pending")!;
    expect(msgTask.draft).toContain("Thanks for connecting");

    await approveActions([msgTask.id], "ishan", true, "Test batch");
    await logTouchpoint({ leadId: lead.id, actionId: msgTask.id, channel: "linkedin", direction: "out", content: msgTask.draft }, "instinct");
    await logTouchpoint({ leadId: lead.id, channel: "linkedin", direction: "in", content: "Sure, send a demo", replyLabel: "interested" }, "instinct");

    const b = await batchDetail("Test batch");
    expect(b.summary.sent).toBe(1);
    expect(b.summary.replied).toBe(1);
    expect(b.rows[0].reply?.content).toBe("Sure, send a demo");

    const conn = await batchDetail(approved.batch!);
    expect(conn.summary.connectionRequests).toBe(1);
    expect(conn.summary.accepted).toBe(1);
    expect((await listBatches()).map((x) => x.name)).toEqual(expect.arrayContaining(["Test batch", approved.batch]));

    await saveRecommendation({ title: "Test batch learnings", body: "Onboarding angle worked.", batch: "Test batch" }, "chatgpt");
    const brief = await agentBrief();
    expect(brief.latestRecommendations[0].title).toBe("Test batch learnings");
    await updateSettings({ draftWriter: "chatgpt" }, "ishan");
  });

  it("protects custom columns a person edited, but lets agents add new ones", async () => {
    const [{ lead }] = await listLeads({ q: "Nina Park" });
    await updateLead(lead.id, { customFields: { "Support team size": "8 (Ishan checked)" } }, "ishan");
    const r = await updateLead(lead.id, { customFields: { "Support team size": "6", "Uses Intercom": "yes" } }, "chatgpt");
    expect(r.skipped).toEqual(["custom:Support team size"]);
    expect(r.lead.customFields).toEqual({ "Support team size": "8 (Ishan checked)", "Uses Intercom": "yes" });
  });

  it("agent adds land as New: no hands-off, no owner, no Researched until research is saved", async () => {
    const res = await addLeads(
      [{ fullName: "Omar Haddad", company: "Shiftbase", email: "omar@shiftbase.com", whyRelevant: "Hiring support", stage: "researched", handsOff: true, owner: "ishan", score: 80 }],
      "chatgpt",
    );
    const id = (res.results[0] as { id: string }).id;
    let d = (await getLeadDetail(id))!;
    expect(d.lead.stage).toBe("new");
    expect(d.lead.handsOff).toBe(false);
    expect(d.lead.owner).toBe("ai");
    expect(d.actions.length).toBe(0);
    expect((await researchQueue()).some((r) => r.lead.id === id)).toBe(true);

    const u = await updateLead(id, { handsOff: true, owner: "ishan", stage: "researched" }, "chatgpt");
    expect(u.skipped).toEqual(expect.arrayContaining(["handsOff", "owner", "stage"]));
    expect(await queueFirstTouch(id)).toBeNull();

    await saveResearch({ leadId: id, relation: "r", whyRelevant: "w", pitchAngle: "Ticket deflection", importance: 80, bestChannel: "email", draftMessage: "Hi Omar…", emailSubject: "Support at Shiftbase" }, "chatgpt");
    d = (await getLeadDetail(id))!;
    expect(d.lead.stage).toBe("researched");
    const t = d.actions.find((a) => a.status === "pending")!;
    expect(t.type).toBe("send_first");
    expect(t.subject).toBe("Support at Shiftbase");
  });

  it("only a person can make a lead hands-off; then it's theirs to send and logged like any send", async () => {
    const [{ lead }] = await listLeads({ q: "Omar Haddad" });
    await updateLead(lead.id, { handsOff: true }, "ishan");
    const own = await selfSendQueue(["ishan"]);
    const task = own.find((r) => r.lead.id === lead.id)!.action;
    expect(task.assignee).toBe("ishan");
    expect((await reviewQueue()).some((r) => r.lead.id === lead.id)).toBe(false);

    await markSent(task.id, "ishan", { content: "Hi Omar, sent from my own Gmail" });
    const d = (await getLeadDetail(lead.id))!;
    expect(d.lead.stage).toBe("contacted");
    const tp = d.touchpoints.find((t) => t.direction === "out")!;
    expect(tp.content).toBe("Hi Omar, sent from my own Gmail");
    expect(tp.createdBy).toBe("ishan");
    expect(tp.batch).toMatch(/Email$/);
    expect(d.actions.find((a) => a.id === task.id)!.status).toBe("done");
  });

  it("gives up on a LinkedIn request nobody accepts: email if known, otherwise nurture", async () => {
    const withEmail = await addLead({ fullName: "Lee Wong", company: "Pendo-ish", linkedinUrl: "linkedin.com/in/leewong", email: "lee@p.io" }, "chatgpt");
    const noEmail = await addLead({ fullName: "Kim Ross", company: "Gainsight-ish", linkedinUrl: "linkedin.com/in/kimross" }, "chatgpt");
    for (const l of [withEmail.lead, noEmail.lead]) {
      const r = await saveResearch({ leadId: l.id, relation: "r", whyRelevant: "w", pitchAngle: "p", importance: 70, bestChannel: "linkedin", connectionNote: "Hi!", draftMessage: "Thanks for connecting", emailSubject: "Quick one" }, "instinct");
      await approveActions([r.queued!.taskId], "ishan");
      await logTouchpoint({ leadId: l.id, actionId: r.queued!.taskId, channel: "linkedin", direction: "out", kind: "connection_request", content: "Hi!", occurredAt: daysAgo(15) }, "instinct");
    }
    const res = await buildDailyQueue();
    expect(res.staleConnections).toBe(2);
    const a = (await getLeadDetail(withEmail.lead.id))!;
    const emailTask = a.actions.find((x) => x.status === "pending")!;
    expect(emailTask.channel).toBe("email");
    expect(emailTask.reason).toContain("not accepted");
    expect((await getLeadDetail(noEmail.lead.id))!.lead.stage).toBe("nurture");
  });
});

describe("ChatGPT writes the messages", () => {
  it("drops drafts from other agents, lets ChatGPT write them, keeps team edits, and locks approved tasks", async () => {
    const { lead } = await addLead({ fullName: "Ana Silva", company: "Hoop", linkedinUrl: "linkedin.com/in/anasilva" }, "chatgpt");
    const r = await saveResearch(
      { leadId: lead.id, relation: "r", whyRelevant: "w", pitchAngle: "p", importance: 70, bestChannel: "linkedin", connectionNote: "Instinct's note", draftMessage: "Instinct's message" },
      "instinct",
    );
    const taskId = r.queued!.taskId;
    let d = (await getLeadDetail(lead.id))!;
    expect(d.lead.connectionNote).toBeNull();
    expect(d.actions.find((a) => a.id === taskId)!.draft).toBeNull();

    const { writeDraft } = await import("@/lib/services/actions");
    await expect(writeDraft(taskId, { draft: "x".repeat(301) }, "chatgpt")).rejects.toThrow(/300/);
    const w = await writeDraft(taskId, { draft: "Hi Ana, loved your talk on Hoop's onboarding. Would love to connect." }, "chatgpt");
    expect(w.written).toBe(true);

    const { updateAction } = await import("@/lib/services/actions");
    await updateAction(taskId, { draft: "Ishan's own note" }, "ishan");
    const again = await writeDraft(taskId, { draft: "ChatGPT tries again" }, "chatgpt");
    expect(again.written).toBe(false);

    await approveActions([taskId], "ishan");
    await expect(writeDraft(taskId, { draft: "late change" }, "chatgpt")).rejects.toThrow(/approved/);
    d = (await getLeadDetail(lead.id))!;
    expect(d.actions.find((a) => a.id === taskId)!.draft).toBe("Ishan's own note");
  });
});
