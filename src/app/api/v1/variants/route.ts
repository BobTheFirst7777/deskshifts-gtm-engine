import { api, body } from "@/lib/api";
import { createVariant, listVariants } from "@/lib/services/variants";
import { replyBreakdown } from "@/lib/services/stats";

export const GET = api(async () => {
  const [variants, perf] = await Promise.all([listVariants(), replyBreakdown("variant", 90)]);
  return { variants: variants.map((v) => ({ ...v, performance: perf.find((p) => p.key === v.id) ?? null })) };
});

export const POST = api(async (req, actor) => createVariant(await body(req) as never, actor));
