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
    const auto = await addLead({ fullName: "Ben Ortiz", company: "Decagon-ish", stage: "researched", score: 90, bestChannel: "email", email: "ben@d.io" }, "claude");
    const manual = await addLead({ fullName: "Sara Lim", company: "Flowly", stage: "researched", score: 60, handsOff: true }, "ishan");

    const res = await buildDailyQueue();
    expect(res.firstTouches).toBeGreaterThanOrEqual(2);

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
    const { lead } = await addLead({ fullName: "Paused Pat", stage: "researched", score: 99 }, "claude");
    await buildDailyQueue();
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
