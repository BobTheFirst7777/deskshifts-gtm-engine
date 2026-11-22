import { api, body } from "@/lib/api";
import { latestInsights, saveRecommendation } from "@/lib/services/batches";

export const GET = api(async () => ({ insights: await latestInsights(10) }));

/** POST { title, body, batch? }: recommendations from an agent. */
export const POST = api(async (req, actor) => saveRecommendation((await body(req)) as never, actor));
