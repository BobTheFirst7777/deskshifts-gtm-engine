import { api, body, query } from "@/lib/api";
import { createAction, listQueue } from "@/lib/services/actions";

/** GET today's queue. ?assignee=instinct  ?all=1 includes future tasks. */
export const GET = api(async (req) => {
  const q = query(req);
  const rows = await listQueue({ assignee: q.assignee, includeFuture: q.all === "1" });
  return {
    actions: rows.map((r) => ({ ...r.action, lead: { ...r.lead, company: r.company } })),
  };
});

export const POST = api(async (req, actor) => createAction(await body(req) as never, actor));
