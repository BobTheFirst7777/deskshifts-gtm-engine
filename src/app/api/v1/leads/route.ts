import { api, body, query } from "@/lib/api";
import { listLeads } from "@/lib/services/leads";
import { addLeads } from "@/lib/ops";

/** GET /api/v1/leads?q=&stage=&tier=&source=&owner=&limit=&sort=score */
export const GET = api(async (req) => {
  const q = query(req);
  const rows = await listLeads({
    q: q.q,
    stage: q.stage,
    tier: q.tier,
    source: q.source,
    owner: q.owner,
    limit: q.limit ? Number(q.limit) : 50,
    offset: q.offset ? Number(q.offset) : 0,
    sort: (q.sort as "score") || undefined,
  });
  return { leads: rows.map((r) => ({ ...r.lead, company: r.company })) };
});

/** POST /api/v1/leads  — one lead, an array, or { leads: [...] }. Duplicates are merged. */
export const POST = api(async (req, actor) => {
  const b = await body(req);
  const list = Array.isArray(b) ? b : Array.isArray(b.leads) ? b.leads : [b];
  return addLeads(list, actor);
});
