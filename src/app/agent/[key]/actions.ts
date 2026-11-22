"use server";

import { redirect } from "next/navigation";
import { actorForKey } from "@/lib/actors";
import { logTouchpoint } from "@/lib/services/touchpoints";
import { setActionStatus } from "@/lib/services/actions";
import { resolveLead } from "@/lib/services/leads";
import { addLeads } from "@/lib/ops";
import { parseAgentText } from "@/lib/ai";
import { executeAgentOps } from "@/lib/services/agent-ops";
import { CHANNELS, REPLY_LABELS } from "@/lib/constants";
import { saveResearch } from "@/lib/services/research";
import { saveRecommendation } from "@/lib/services/batches";
import { z } from "zod";

function auth(fd: FormData) {
  const key = String(fd.get("key") ?? "");
  const actor = actorForKey(key);
  if (!actor) throw new Error("Invalid key");
  return { key, actor };
}

function back(key: string, page: string, msg: string, ok = true): never {
  const p = new URLSearchParams({ [ok ? "msg" : "err"]: msg });
  redirect(`/agent/${key}/${page}?${p.toString()}`);
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export async function markSent(fd: FormData) {
  const { key, actor } = auth(fd);
  const actionId = str(fd, "actionId")!;
  const leadId = str(fd, "leadId")!;
  const channel = (str(fd, "channel") ?? "linkedin") as (typeof CHANNELS)[number];
  let msg = "";
  try {
    await logTouchpoint(
      {
        leadId,
        actionId,
        channel,
        direction: "out",
        kind: str(fd, "kind") === "connection_request" ? "connection_request" : "message",
        content: str(fd, "content"),
        subject: str(fd, "subject"),
      },
      actor,
    );
    msg = `Logged as sent: ${str(fd, "name") ?? "lead"}`;
  } catch (e) {
    back(key, "today", (e as Error).message, false);
  }
  back(key, "today", msg);
}

export async function skipTask(fd: FormData) {
  const { key, actor } = auth(fd);
  let msg = "";
  try {
    await setActionStatus(str(fd, "actionId")!, "skipped", actor, str(fd, "reason") ?? "skipped by Instinct");
    msg = `Skipped: ${str(fd, "name") ?? "task"}`;
  } catch (e) {
    back(key, "today", (e as Error).message, false);
  }
  back(key, "today", msg);
}

export async function logReply(fd: FormData) {
  const { key, actor } = auth(fd);
  let msg = "";
  try {
    const ref = str(fd, "lead") ?? "";
    const isUrl = ref.includes("linkedin.com");
    const isEmail = ref.includes("@") && !isUrl;
    const lead = await resolveLead({
      id: str(fd, "leadId"),
      linkedinUrl: isUrl ? ref : null,
      email: isEmail ? ref : null,
      name: !isUrl && !isEmail ? ref : null,
      company: str(fd, "company"),
    });
    if (!lead) throw new Error(`No lead matches "${ref}". Use their LinkedIn URL or email.`);
    const label = str(fd, "replyLabel");
    await logTouchpoint(
      {
        leadId: lead.id,
        channel: (str(fd, "channel") ?? "linkedin") as (typeof CHANNELS)[number],
        direction: "in",
        content: str(fd, "content"),
        replyLabel: label && (REPLY_LABELS as readonly string[]).includes(label) ? (label as (typeof REPLY_LABELS)[number]) : null,
      },
      actor,
    );
    msg = `Logged reply from ${lead.fullName}. Follow-ups stopped and the team was alerted.`;
  } catch (e) {
    back(key, "log", (e as Error).message, false);
  }
  back(key, "log", msg);
}

export async function freeTextUpdate(fd: FormData) {
  const { key, actor } = auth(fd);
  const text = str(fd, "text");
  const page = str(fd, "page") ?? "log";
  if (!text) back(key, page, "Write what happened first.", false);
  let msg = "";
  let ok = true;
  try {
    const parsed = await parseAgentText(text!);
    const results = await executeAgentOps(parsed, actor);
    ok = results.every((r) => r.ok);
    msg = results.map((r) => `${r.ok ? "✓" : "✗"} ${r.text}`).join("\n") || "Nothing to record.";
  } catch (e) {
    back(key, page, (e as Error).message, false);
  }
  back(key, page, msg, ok);
}

export async function addLeadForm(fd: FormData) {
  const { key, actor } = auth(fd);
  let msg = "";
  try {
    const signal = str(fd, "signal");
    const r = await addLeads(
      [
        {
          fullName: str(fd, "fullName"),
          title: str(fd, "title"),
          company: str(fd, "company"),
          companyDomain: str(fd, "companyDomain"),
          linkedinUrl: str(fd, "linkedinUrl"),
          email: str(fd, "email"),
          phone: str(fd, "phone"),
          location: str(fd, "location"),
          whyRelevant: str(fd, "whyRelevant"),
          sourceDetail: str(fd, "sourceDetail"),
          event: str(fd, "event"),
          signals: signal ? [{ type: "other", summary: signal, url: str(fd, "signalUrl") }] : undefined,
        },
      ],
      actor,
    );
    const first = r.results[0];
    if (!first.ok) throw new Error(first.error);
    msg = first.created ? `Added ${first.name}.` : `${first.name} was already in the system; merged the new details.`;
  } catch (e) {
    back(key, "add", (e as Error).message, false);
  }
  back(key, "add", msg);
}

export async function saveResearchAgent(fd: FormData) {
  const { key, actor } = auth(fd);
  let msg = "";
  try {
    const custom: Record<string, string> = {};
    for (const line of (str(fd, "customFields") ?? "").split("\n")) {
      const i = line.indexOf(":");
      if (i > 0 && line.slice(i + 1).trim()) custom[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const signals = (str(fd, "signals") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const url = l.match(/https?:\/\/\S+/)?.[0] ?? null;
        return { type: "other" as const, summary: l.replace(url ?? "", "").replace(/[\s(—-]+$/, "").trim() || l, url };
      });
    const r = await saveResearch(
      {
        leadId: str(fd, "leadId")!,
        relation: str(fd, "relation") ?? "",
        whyRelevant: str(fd, "whyRelevant") ?? "",
        pitchAngle: str(fd, "pitchAngle") ?? "",
        importance: Number(str(fd, "importance") ?? 50),
        bestChannel: (str(fd, "bestChannel") ?? "linkedin") as "linkedin",
        connectionNote: str(fd, "connectionNote"),
        draftMessage: str(fd, "draftMessage"),
        emailSubject: str(fd, "emailSubject"),
        email: str(fd, "email"),
        linkedinConnected: fd.get("linkedinConnected") === "on",
        customFields: custom,
        signals,
      },
      actor,
    );
    msg = `Saved research for ${str(fd, "name") ?? "lead"}.${r.queued ? ` ${r.queued.type === "connect" ? "Connection request" : "First message"} is now waiting for the team's approval.` : ""}`;
  } catch (e) {
    back(key, "research", e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message, false);
  }
  back(key, "research", msg);
}

export async function logAccepted(fd: FormData) {
  const { key, actor } = auth(fd);
  let msg = "";
  try {
    const ref = str(fd, "lead") ?? "";
    const isUrl = ref.includes("linkedin.com");
    const lead = await resolveLead({ linkedinUrl: isUrl ? ref : null, name: isUrl ? null : ref, company: str(fd, "company") });
    if (!lead) throw new Error(`No lead matches "${ref}". Use their LinkedIn URL.`);
    const r = await logTouchpoint({ leadId: lead.id, channel: "linkedin", direction: "in", kind: "connection_accepted" }, actor);
    msg = `${lead.fullName} accepted.${(r as { queued?: unknown }).queued ? " Their first message is now waiting for the team's approval." : ""}`;
  } catch (e) {
    back(key, "log", (e as Error).message, false);
  }
  back(key, "log", msg);
}

export async function saveRecommendationAgent(fd: FormData) {
  const { key, actor } = auth(fd);
  try {
    await saveRecommendation({ title: str(fd, "title") ?? "Recommendations", body: str(fd, "body") ?? "", batch: str(fd, "batch") }, actor);
  } catch (e) {
    back(key, "log", (e as Error).message, false);
  }
  back(key, "log", "Recommendations saved. The team sees them on Insights.");
}
