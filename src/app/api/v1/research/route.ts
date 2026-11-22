import { api, body, query } from "@/lib/api";
import { researchQueue, saveResearch } from "@/lib/services/research";

/** GET leads waiting for research. */
export const GET = api(async (req) => {
  const rows = await researchQueue(Number(query(req).limit ?? 25));
  return { leads: rows.map((r) => ({ ...r.lead, company: r.company })) };
});

/** POST research for one lead: { leadId, relation, whyRelevant, pitchAngle, importance, bestChannel, ... } */
export const POST = api(async (req, actor) => saveResearch((await body(req)) as never, actor));
