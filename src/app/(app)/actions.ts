"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { checkPassword, createSessionToken, SESSION_COOKIE, sessionMaxAge } from "@/lib/session";
import {
  addSignals,
  deleteLead,
  findOrCreateEvent,
  restoreLead,
  updateCompany,
  updateLead,
  type LeadPatch,
} from "@/lib/services/leads";
import { logTouchpoint, deleteTouchpoint } from "@/lib/services/touchpoints";
import { approveActions, createAction, listQueue, setActionStatus, updateAction } from "@/lib/services/actions";
import { revertActivity } from "@/lib/services/revert";
import { updateSettings, type Settings } from "@/lib/services/settings";
import { createVariant, updateVariant } from "@/lib/services/variants";
import { addLeads } from "@/lib/ops";
import { aiEnabled, parseAgentText, researchLead } from "@/lib/ai";
import { executeAgentOps } from "@/lib/services/agent-ops";
import { JOBS, type JobName } from "@/lib/jobs";
import { parseCsv, rowsToLeads } from "@/lib/csv";
import { saveRecommendation } from "@/lib/services/batches";
import { isSendTask, markSent } from "@/lib/services/sends";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { CHANNELS, REPLY_LABELS, STAGES, TOUCH_KINDS } from "@/lib/constants";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const sOrNull = (fd: FormData, k: string) => s(fd, k) || null;

function refresh() {
  revalidatePath("/", "layout");
}

function go(path: string, msg?: string, err?: string): never {
  const u = new URL(path, "http://x");
  if (msg) u.searchParams.set("msg", msg);
  if (err) u.searchParams.set("err", err);
  redirect(u.pathname + u.search);
}

const back = (fd: FormData) => s(fd, "back") || "/";

// ---------------------------------------------------------------- auth

export async function login(fd: FormData) {
  const user = s(fd, "user").toLowerCase();
  const next = s(fd, "next") || "/";
  if (!checkPassword(user, s(fd, "password"))) {
    go(`/login?next=${encodeURIComponent(next)}`, undefined, "Wrong name or password.");
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionMaxAge,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------------------------------------------------------------- leads

export async function quickAddLead(fd: FormData) {
  const user = await requireUser();
  const r = await addLeads(
    [
      {
        fullName: s(fd, "fullName"),
        title: sOrNull(fd, "title"),
        company: sOrNull(fd, "company"),
        companyDomain: sOrNull(fd, "companyDomain"),
        linkedinUrl: sOrNull(fd, "linkedinUrl"),
        email: sOrNull(fd, "email"),
        phone: sOrNull(fd, "phone"),
        location: sOrNull(fd, "location"),
        whyRelevant: sOrNull(fd, "whyRelevant"),
        sourceDetail: sOrNull(fd, "sourceDetail"),
        event: sOrNull(fd, "event"),
        tier: (sOrNull(fd, "tier") as "standard") ?? undefined,
        handsOff: fd.get("handsOff") === "on",
        notes: sOrNull(fd, "notes"),
      },
    ],
    user,
  );
  const first = r.results[0];
  if (!first.ok) go(back(fd), undefined, first.error);
  refresh();
  go(`/leads/${first.id}`, first.created ? "Lead added." : "Already here; merged the new details into the existing lead.");
}

export async function bulkAddLeads(fd: FormData) {
  const user = await requireUser();
  const text = s(fd, "csv");
  if (!text) go("/leads/new", undefined, "Paste some rows first.");
  const rows = parseCsv(text);
  const leads = rowsToLeads(rows);
  let summary = "";
  if (leads.length) {
    const r = await addLeads(leads.map((l) => ({ ...l, sourceDetail: l.sourceDetail ?? s(fd, "sourceDetail") ?? undefined })), user);
    summary = `${r.added} added, ${r.merged} merged with existing leads${r.failed ? `, ${r.failed} failed (${r.results.filter((x) => !x.ok).map((x) => (x as { error: string }).error).slice(0, 3).join("; ")})` : ""}.`;
  } else if (aiEnabled()) {
    const parsed = await parseAgentText(`Add these leads:\n${text}`);
    const res = await executeAgentOps(parsed, user);
    summary = res.map((x) => `${x.ok ? "✓" : "✗"} ${x.text}`).join("\n");
  } else {
    go("/leads/new", undefined, "Couldn't find a header row. The first line needs column names like name, company, linkedin, email.");
  }
  refresh();
  go("/leads", summary);
}

export async function saveLead(fd: FormData) {
  const user = await requireUser();
  const id = s(fd, "id");
  const fields = [
    "fullName", "title", "email", "phone", "linkedinUrl", "location", "whyRelevant", "relation", "pitchAngle",
    "segment", "notes", "sourceDetail", "draftMessage", "connectionNote", "emailSubject",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const f of fields) if (fd.has(f)) patch[f] = sOrNull(fd, f);
  if (fd.has("score")) patch.score = s(fd, "score") === "" ? null : Number(s(fd, "score"));
  for (const f of ["tier", "stage", "priority", "bestChannel", "owner"] as const) if (fd.has(f)) patch[f] = sOrNull(fd, f);
  if (fd.has("tags")) patch.tags = s(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean);
  if (fd.has("customFields")) {
    // One "Column: value" per line. Lines removed are removed.
    const next: Record<string, string | null> = {};
    for (const line of s(fd, "customFields").split("\n")) {
      const i = line.indexOf(":");
      if (i > 0 && line.slice(i + 1).trim()) next[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    for (const k of s(fd, "customFieldKeys").split("\u0001").filter(Boolean)) if (!(k in next)) next[k] = null;
    patch.customFields = next;
  }
  if (fd.has("linkedinStatus")) patch.linkedinStatus = sOrNull(fd, "linkedinStatus");
  if (!patch.fullName) delete patch.fullName;
  try {
    await updateLead(id, patch as LeadPatch, user);
    if (fd.has("companyId") && s(fd, "companyId")) {
      const cp: Record<string, unknown> = {};
      for (const f of ["companyName", "companyDomain", "companySize", "companyIndustry", "companyFunding", "companyDescription"]) {
        if (fd.has(f)) cp[f.replace("company", "").replace(/^./, (c) => c.toLowerCase())] = sOrNull(fd, f);
      }
      if (cp.funding !== undefined) {
        cp.fundingStage = cp.funding;
        delete cp.funding;
      }
      if (cp.name === null) delete cp.name;
      await updateCompany(s(fd, "companyId"), cp, user);
    }
  } catch (e) {
    go(`/leads/${id}`, undefined, (e as Error).message);
  }
  refresh();
  go(`/leads/${id}`, "Saved. Your edits won't be overwritten by the engine.");
}

export async function setLeadField(fd: FormData) {
  const user = await requireUser();
  const id = s(fd, "id");
  const field = s(fd, "field");
  const raw = s(fd, "value");
  let value: unknown = raw;
  if (field === "handsOff" || field === "paused") value = raw === "true";
  if (field === "stage" && !(STAGES as readonly string[]).includes(raw)) return;
  await updateLead(id, { [field]: value } as LeadPatch, user);
  refresh();
}

export async function deleteLeadAction(fd: FormData) {
  const user = await requireUser();
  await deleteLead(s(fd, "id"), user);
  refresh();
  go("/leads", "Lead deleted. Undo it from Activity if that was a mistake.");
}

export async function restoreLeadAction(fd: FormData) {
  const user = await requireUser();
  await restoreLead(s(fd, "id"), user);
  refresh();
}

export async function researchNow(fd: FormData) {
  await requireUser();
  const id = s(fd, "id");
  if (!aiEnabled()) go(`/leads/${id}`, undefined, "Add OPENAI_API_KEY to turn on research.");
  try {
    const r = await researchLead(id);
    if (!r.ok) throw new Error(r.reason);
  } catch (e) {
    go(`/leads/${id}`, undefined, `Research failed: ${(e as Error).message}`);
  }
  refresh();
  go(`/leads/${id}`, "Research done. Score, signals and a draft were added (your own edits were kept).");
}

// ---------------------------------------------------------------- timeline

export async function logTouchpointForm(fd: FormData) {
  const user = await requireUser();
  const leadId = s(fd, "leadId");
  const when = s(fd, "occurredAt");
  const [dirRaw, kindRaw] = (s(fd, "kindDir") || `${s(fd, "direction") || "out"}:${s(fd, "kind") || "message"}`).split(":");
  try {
    await logTouchpoint(
      {
        leadId,
        channel: (s(fd, "channel") || "other") as (typeof CHANNELS)[number],
        direction: dirRaw === "in" ? "in" : "out",
        kind: ((TOUCH_KINDS as readonly string[]).includes(kindRaw) ? kindRaw : "message") as (typeof TOUCH_KINDS)[number],
        content: sOrNull(fd, "content"),
        subject: sOrNull(fd, "subject"),
        replyLabel: (REPLY_LABELS as readonly string[]).includes(s(fd, "replyLabel")) ? (s(fd, "replyLabel") as (typeof REPLY_LABELS)[number]) : null,
        occurredAt: when ? new Date(when) : null,
        actionId: sOrNull(fd, "actionId"),
      },
      user,
    );
  } catch (e) {
    go(`/leads/${leadId}`, undefined, (e as Error).message);
  }
  refresh();
  go(`/leads/${leadId}`);
}

export async function deleteTouchpointAction(fd: FormData) {
  const user = await requireUser();
  await deleteTouchpoint(s(fd, "id"), user);
  refresh();
}

export async function addSignalForm(fd: FormData) {
  const user = await requireUser();
  await addSignals(s(fd, "leadId"), [{ type: (s(fd, "type") || "other") as "other", summary: s(fd, "summary"), url: sOrNull(fd, "url") }], user);
  refresh();
}

// ---------------------------------------------------------------- tasks

export async function createTaskForm(fd: FormData) {
  const user = await requireUser();
  await createAction(
    {
      leadId: s(fd, "leadId"),
      type: (s(fd, "type") || "custom") as "custom",
      channel: (sOrNull(fd, "channel") as "email") ?? undefined,
      assignee: s(fd, "assignee") || user,
      dueAt: s(fd, "dueAt") ? new Date(s(fd, "dueAt")) : new Date(),
      draft: sOrNull(fd, "draft"),
      reason: sOrNull(fd, "reason"),
    },
    user,
  );
  refresh();
}

export async function taskStatus(fd: FormData) {
  const user = await requireUser();
  const id = s(fd, "id");
  const status = s(fd, "status") as "done";
  const [task] = await getDb().select().from(schema.actions).where(eq(schema.actions.id, id));
  // Marking a send task done means you sent it: log it on the timeline and in a batch.
  if (task && status === "done" && isSendTask(task.type)) await markSent(id, user);
  else await setActionStatus(id, status, user, sOrNull(fd, "note") ?? undefined);
  refresh();
}

export async function sentByMe(fd: FormData) {
  const user = await requireUser();
  const back = s(fd, "back") || "/review";
  try {
    await markSent(s(fd, "id"), user, { content: sOrNull(fd, "content"), subject: sOrNull(fd, "subject"), batch: sOrNull(fd, "batch") });
  } catch (e) {
    go(back, undefined, (e as Error).message);
  }
  refresh();
  go(back, `Logged as sent by you${s(fd, "name") ? `: ${s(fd, "name")}` : ""}.`);
}

export async function saveTask(fd: FormData) {
  const user = await requireUser();
  const patch: Record<string, unknown> = {};
  if (fd.has("draft")) patch.draft = sOrNull(fd, "draft");
  if (fd.has("assignee")) patch.assignee = s(fd, "assignee");
  if (fd.has("channel")) patch.channel = sOrNull(fd, "channel");
  if (fd.has("dueAt") && s(fd, "dueAt")) patch.dueAt = new Date(s(fd, "dueAt"));
  await updateAction(s(fd, "id"), patch, user);
  if (fd.get("approve") === "1") await approveActions([s(fd, "id")], user);
  refresh();
}

export async function approveTask(fd: FormData) {
  const user = await requireUser();
  await approveActions([s(fd, "id")], user, s(fd, "approve") !== "0");
  refresh();
}

export async function approveAllInstinct() {
  const user = await requireUser();
  const rows = await listQueue({ assignee: "instinct" });
  const n = await approveActions(rows.filter((r) => !r.action.approvedAt).map((r) => r.action.id), user);
  refresh();
  go("/", `Approved ${n} task${n === 1 ? "" : "s"} for Instinct.`);
}

// ---------------------------------------------------------------- undo, settings, jobs

export async function undo(fd: FormData) {
  const user = await requireUser();
  try {
    await revertActivity(s(fd, "id"), user);
  } catch (e) {
    go(back(fd), undefined, (e as Error).message);
  }
  refresh();
  go(back(fd), "Undone.");
}

export async function saveSettings(fd: FormData) {
  const user = await requireUser();
  const patch: Partial<Settings> = {};
  if (fd.has("icp")) patch.icp = s(fd, "icp");
  if (fd.has("pitch")) patch.pitch = s(fd, "pitch");
  if (fd.has("sourcingBrief")) patch.sourcingBrief = s(fd, "sourcingBrief");
  for (const k of ["dailyTarget", "followUpDays", "maxFollowUps", "linkedinDailyLimit", "nightlyLeadTarget", "connectionGiveUpDays"] as const) {
    if (fd.has(k) && s(fd, k)) patch[k] = Math.max(0, Number(s(fd, k)));
  }
  if (fd.has("instinctMode")) patch.instinctMode = s(fd, "instinctMode") === "auto" ? "auto" : "approve";
  if (fd.has("draftWriter")) patch.draftWriter = s(fd, "draftWriter") === "any" ? "any" : "chatgpt";
  await updateSettings(patch, user);
  refresh();
  go("/settings", "Settings saved.");
}

export async function setAutomationPaused(fd: FormData) {
  const user = await requireUser();
  await updateSettings({ automationPaused: s(fd, "paused") === "true" }, user);
  refresh();
}

export async function runJob(fd: FormData) {
  await requireUser();
  const job = s(fd, "job") as JobName;
  if (!(job in JOBS)) return;
  let msg = "";
  try {
    const r = await JOBS[job]();
    msg = `${job} finished: ${JSON.stringify(r)}`;
  } catch (e) {
    go(back(fd), undefined, `${job} failed: ${(e as Error).message}`);
  }
  refresh();
  go(back(fd), msg);
}

// ---------------------------------------------------------------- variants, events

export async function createVariantForm(fd: FormData) {
  const user = await requireUser();
  await createVariant(
    { name: s(fd, "name"), body: s(fd, "body"), angle: sOrNull(fd, "angle"), segment: sOrNull(fd, "segment"), channel: (sOrNull(fd, "channel") as "email") ?? undefined },
    user,
  );
  refresh();
  go("/experiments", "Message version added. Research will start using it in new drafts.");
}

export async function setVariantStatus(fd: FormData) {
  const user = await requireUser();
  await updateVariant(s(fd, "id"), { status: s(fd, "status") as "active" }, user);
  refresh();
}

export async function addEventForm(fd: FormData) {
  const user = await requireUser();
  await findOrCreateEvent({ name: s(fd, "name"), url: sOrNull(fd, "url"), date: sOrNull(fd, "date"), location: sOrNull(fd, "location") }, user);
  refresh();
  go("/events", "Event added. Add its attendees with the event name filled in, or ask an agent to.");
}

// ---------------------------------------------------------------- review & send

export async function submitReview(fd: FormData) {
  const user = await requireUser();
  const items = fd.getAll("item").map(String);
  const selected = new Set(fd.getAll("ids").map(String));
  const mode = s(fd, "mode");
  const batch = sOrNull(fd, "batch");
  const back = s(fd, "back") || "/review";

  // Save any edited drafts first (marked as yours, so nothing overwrites them).
  for (const id of items) {
    const patch: Record<string, unknown> = {};
    if (fd.has(`draft:${id}`) && s(fd, `draft:${id}`) !== s(fd, `orig:${id}`)) patch.draft = sOrNull(fd, `draft:${id}`);
    if (fd.has(`subject:${id}`) && s(fd, `subject:${id}`) !== s(fd, `origsubject:${id}`)) patch.subject = sOrNull(fd, `subject:${id}`);
    if (Object.keys(patch).length) await updateAction(id, patch, user);
  }
  const toApprove = mode === "all" ? items : items.filter((id) => selected.has(id));
  if (mode === "save") {
    refresh();
    go(back, "Drafts saved.");
  }
  if (!toApprove.length) go(back, undefined, "Tick at least one message, or press Approve all.");
  const n = await approveActions(toApprove, user, true, batch);
  refresh();
  go(back, `Approved ${n}. Instinct will send ${n === 1 ? "it" : "them"} and log each one${batch ? ` in batch "${batch}"` : ""}.`);
}

export async function skipReviewItem(fd: FormData) {
  const user = await requireUser();
  const id = s(fd, "skip");
  if (id) await setActionStatus(id, "skipped", user, "skipped in review");
  refresh();
}

export async function saveRecommendationForm(fd: FormData) {
  const user = await requireUser();
  await saveRecommendation({ title: s(fd, "title"), body: s(fd, "body"), batch: sOrNull(fd, "batch") }, user);
  refresh();
  go("/insights", "Saved.");
}
