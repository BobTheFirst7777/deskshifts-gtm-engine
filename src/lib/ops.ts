/**
 * Higher-level operations shared by the REST API, the MCP server, the agent pages
 * and the dashboard, so every door behaves the same way.
 */
import { after } from "next/server";
import { z } from "zod";
import { addLead, leadInput, resolveLead, type AddLeadResult } from "@/lib/services/leads";
import { logTouchpoint, touchpointInput } from "@/lib/services/touchpoints";
import { aiEnabled, researchLead, logAiError } from "@/lib/ai";
import { HttpError } from "@/lib/api";

export const leadRefInput = z.object({
  id: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  email: z.string().nullish(),
  name: z.string().nullish(),
  company: z.string().nullish(),
});

/** Research new leads in the background after the response is sent. */
export function scheduleResearch(ids: string[]) {
  if (!aiEnabled() || !ids.length) return;
  const batch = ids.slice(0, 5);
  try {
    after(async () => {
      for (const id of batch) {
        try {
          await researchLead(id);
        } catch (e) {
          await logAiError("research", e);
        }
      }
    });
  } catch {
    // Outside a request (scripts/tests): the nightly job will pick them up.
  }
}

export async function addLeads(list: unknown[], actor: string) {
  const results: Array<{ ok: true; created: boolean; id: string; name: string; filled: string[] } | { ok: false; error: string; input: unknown }> = [];
  const createdIds: string[] = [];
  for (const raw of list) {
    try {
      const r: AddLeadResult = await addLead(leadInput.parse(raw), actor);
      results.push({ ok: true, created: r.created, id: r.lead.id, name: r.lead.fullName, filled: r.filled });
      if (r.created) createdIds.push(r.lead.id);
    } catch (e) {
      results.push({
        ok: false,
        error: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : (e as Error).message,
        input: raw,
      });
    }
  }
  scheduleResearch(createdIds);
  return {
    added: results.filter((r) => r.ok && r.created).length,
    merged: results.filter((r) => r.ok && !r.created).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export const logInput = touchpointInput.omit({ leadId: true }).extend({
  leadId: z.string().uuid().nullish(),
  lead: leadRefInput.nullish(),
});

/** Log a touchpoint using either a lead id or a loose reference (LinkedIn, email, name). */
export async function logForLead(raw: unknown, actor: string) {
  const input = logInput.parse(raw);
  let leadId = input.leadId ?? null;
  if (!leadId && input.lead) {
    const l = await resolveLead(input.lead);
    if (!l) throw new HttpError(404, "Lead not found. Pass leadId, or a LinkedIn URL / email that matches a lead.");
    leadId = l.id;
  }
  if (!leadId) throw new HttpError(400, "Pass leadId or lead {linkedinUrl|email|name}");
  return logTouchpoint({ ...input, leadId }, actor);
}
