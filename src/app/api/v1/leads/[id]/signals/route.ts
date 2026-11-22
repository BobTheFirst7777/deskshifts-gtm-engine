import { api, body } from "@/lib/api";
import { addSignals } from "@/lib/services/leads";

/** POST { signals: [{ type, summary, url }] } or a single signal object. */
export const POST = api<{ id: string }>(async (req, actor, { id }) => {
  const b = await body(req);
  const list = Array.isArray(b.signals) ? b.signals : [b];
  return { signals: await addSignals(id, list, actor) };
});
