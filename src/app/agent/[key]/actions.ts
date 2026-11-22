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
      { leadId, actionId, channel, direction: "out", kind: str(fd, "kind") === "connection_request" ? "connection_request" : "message", content: str(fd, "content") },
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
