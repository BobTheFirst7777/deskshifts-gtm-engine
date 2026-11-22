import type { AgentOps } from "@/lib/ai";
import { addLead, addSignals, resolveLead, updateLead } from "./leads";
import { logTouchpoint } from "./touchpoints";
import { setActionStatus } from "./actions";
import { getDb, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

export type OpResult = { ok: boolean; text: string; leadId?: string };

/** Accepts a full UUID or the short "A-xxxxxxxx" ids shown on agent pages. */
async function resolveActionId(raw: string | null): Promise<string | null> {
  if (!raw) return null;
  const m = raw.match(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/i);
  if (m) return m[0];
  const short = raw.replace(/^A-/i, "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}$/.test(short)) return null;
  const db = getDb();
  const rows = await db
    .select({ id: schema.actions.id })
    .from(schema.actions)
    .where(sql`${schema.actions.id}::text like ${short + "%"}`)
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}

/** Run operations parsed from an agent's plain-English update. Each one reports back. */
export async function executeAgentOps(parsed: AgentOps, actor: string): Promise<OpResult[]> {
  const results: OpResult[] = [];
  for (const op of parsed.ops) {
    try {
      const ref = { name: op.lead.name, company: op.lead.company, linkedinUrl: op.lead.linkedinUrl, email: op.lead.email };
      if (op.type === "add_lead") {
        if (!op.lead.name) throw new Error("A new lead needs a name");
        const r = await addLead(
          {
            fullName: op.lead.name,
            company: op.lead.company,
            linkedinUrl: op.lead.linkedinUrl,
            email: op.lead.email,
            title: op.newLead?.title,
            phone: op.newLead?.phone,
            location: op.newLead?.location,
            companyDomain: op.newLead?.companyDomain,
            whyRelevant: op.newLead?.whyRelevant,
            sourceDetail: op.newLead?.sourceDetail,
            event: op.newLead?.event,
            signals: op.signal ? [op.signal] : undefined,
          },
          actor,
        );
        results.push({
          ok: true,
          leadId: r.lead.id,
          text: r.created ? `Added ${r.lead.fullName}` : `${r.lead.fullName} was already here; merged${r.filled.length ? ` (${r.filled.join(", ")})` : ""}`,
        });
        continue;
      }

      const actionId = await resolveActionId(op.actionId);
      let lead = await resolveLead(ref);
      if (!lead && actionId) {
        const db = getDb();
        const [a] = await db.select().from(schema.actions).where(eq(schema.actions.id, actionId));
        if (a) lead = await resolveLead({ id: a.leadId });
      }
      if (!lead) throw new Error(`Couldn't find the lead "${op.lead.name ?? op.lead.linkedinUrl ?? op.lead.email ?? "?"}". Add their LinkedIn URL or the action id.`);

      switch (op.type) {
        case "log_sent":
          await logTouchpoint({ leadId: lead.id, channel: op.channel ?? "linkedin", direction: "out", kind: "message", content: op.content, actionId }, actor);
          results.push({ ok: true, leadId: lead.id, text: `Logged message sent to ${lead.fullName}` });
          break;
        case "log_reply":
          await logTouchpoint({ leadId: lead.id, channel: op.channel ?? "linkedin", direction: "in", kind: "message", content: op.content, replyLabel: op.replyLabel }, actor);
          results.push({ ok: true, leadId: lead.id, text: `Logged reply from ${lead.fullName}${op.replyLabel ? ` (${op.replyLabel})` : ""}` });
          break;
        case "log_call_or_meeting":
          await logTouchpoint({ leadId: lead.id, channel: op.channel ?? "call", direction: "out", kind: op.channel === "call" ? "call" : "meeting", content: op.content, actionId }, actor);
          results.push({ ok: true, leadId: lead.id, text: `Logged call/meeting with ${lead.fullName}` });
          break;
        case "add_note":
          await logTouchpoint({ leadId: lead.id, channel: op.channel ?? "other", direction: "out", kind: "note", content: op.content ?? op.reason }, actor);
          results.push({ ok: true, leadId: lead.id, text: `Added a note to ${lead.fullName}` });
          break;
        case "update_lead": {
          const u = Object.fromEntries(Object.entries(op.updates ?? {}).filter(([, v]) => v !== null));
          const r = await updateLead(lead.id, u, actor);
          results.push({
            ok: true,
            leadId: lead.id,
            text: `Updated ${lead.fullName}${r.changed.length ? `: ${r.changed.join(", ")}` : " (no change)"}${r.skipped.length ? `; kept the team's own values for ${r.skipped.join(", ")}` : ""}`,
          });
          break;
        }
        case "add_signal":
          if (op.signal) await addSignals(lead.id, [op.signal], actor);
          results.push({ ok: true, leadId: lead.id, text: `Added a signal to ${lead.fullName}` });
          break;
        case "skip_action":
          if (!actionId) throw new Error("Skipping needs the action id");
          await setActionStatus(actionId, "skipped", actor, op.reason ?? undefined);
          results.push({ ok: true, leadId: lead.id, text: `Skipped the task for ${lead.fullName}` });
          break;
      }
    } catch (e) {
      results.push({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const u of parsed.unclear ?? []) results.push({ ok: false, text: `Not understood: ${u}` });
  return results;
}
