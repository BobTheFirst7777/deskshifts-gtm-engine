import { api, body } from "@/lib/api";
import { logForLead } from "@/lib/ops";

/**
 * POST a message sent, a reply, a call, a meeting or a note.
 * { leadId | lead: { linkedinUrl | email | name }, channel, direction: "out"|"in", kind, content, replyLabel, actionId }
 */
export const POST = api(async (req, actor) => logForLead(await body(req), actor));
