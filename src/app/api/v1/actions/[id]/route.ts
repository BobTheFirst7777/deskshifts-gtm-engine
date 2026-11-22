import { api, body } from "@/lib/api";
import { setActionStatus, updateAction } from "@/lib/services/actions";

/** PATCH { status: "done"|"skipped"|"pending", note } or edits { draft, assignee, dueAt, channel, priority }. */
export const PATCH = api<{ id: string }>(async (req, actor, { id }) => {
  const b = await body(req);
  if (typeof b.status === "string") {
    return setActionStatus(id, b.status as "done", actor, typeof b.note === "string" ? b.note : undefined);
  }
  return updateAction(id, b, actor);
});
