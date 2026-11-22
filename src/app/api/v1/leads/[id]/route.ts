import { api, body, HttpError } from "@/lib/api";
import { deleteLead, getLeadDetail, updateLead } from "@/lib/services/leads";

export const GET = api<{ id: string }>(async (_req, _actor, { id }) => {
  const d = await getLeadDetail(id);
  if (!d) throw new HttpError(404, "Lead not found");
  return d;
});

/** Agents can't overwrite fields a person set; those come back in `skipped`. */
export const PATCH = api<{ id: string }>(async (req, actor, { id }) => {
  return updateLead(id, await body(req), actor);
});

export const DELETE = api<{ id: string }>(async (_req, actor, { id }) => {
  await deleteLead(id, actor);
  return { ok: true };
});
