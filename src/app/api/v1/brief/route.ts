import { api } from "@/lib/api";
import { agentBrief } from "@/lib/services/brief";

/** GET the brief agents read before starting work. */
export const GET = api(async () => agentBrief());
