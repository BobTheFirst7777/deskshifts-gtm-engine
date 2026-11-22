import { api, query } from "@/lib/api";
import { dailySummary } from "@/lib/services/summary";

export const GET = api(async (req) => {
  const s = await dailySummary();
  if (query(req).format === "text") return new Response(s.text, { headers: { "content-type": "text/plain; charset=utf-8" } });
  return s;
});
