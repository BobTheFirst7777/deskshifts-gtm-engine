import { api, query, HttpError } from "@/lib/api";
import { searchEverything } from "@/lib/services/leads";

/** GET /api/v1/search?q=decagon → every matching person and company with full history. */
export const GET = api(async (req) => {
  const q = query(req).q;
  if (!q) throw new HttpError(400, "Pass ?q=");
  return { results: await searchEverything(q, 10) };
});
