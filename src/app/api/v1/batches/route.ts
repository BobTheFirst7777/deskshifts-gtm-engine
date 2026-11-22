import { api, query } from "@/lib/api";
import { batchResultsForAgents } from "@/lib/services/batches";

/** GET recent batches, or ?name=<batch> for everyone in one batch and their replies. */
export const GET = api(async (req) => batchResultsForAgents(query(req).name));
