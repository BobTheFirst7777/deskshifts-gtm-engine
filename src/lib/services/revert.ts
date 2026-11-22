import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { record } from "./activity";
import { deleteLead, restoreLead, updateCompany, updateLead, NotFound } from "./leads";
import { deleteTouchpoint } from "./touchpoints";
import { approveActions, setActionStatus, updateAction } from "./actions";
import { updateSettings, type Settings } from "./settings";

/**
 * Undo one entry from the activity log. Each side effect (a stage change, a cancelled
 * follow-up) is its own entry, so people can undo exactly what they want.
 */
export async function revertActivity(activityId: string, actor: string) {
  const db = getDb();
  const [a] = await db.select().from(schema.activity).where(eq(schema.activity.id, activityId));
  if (!a) throw new NotFound("Activity not found");
  if (a.revertedAt) throw new Error("Already undone");
  const before = (a.before ?? {}) as Record<string, unknown>;

  switch (`${a.entityType}:${a.action}`) {
    case "lead:update":
    case "lead:merge":
      await updateLead(a.entityId, before, actor, { force: true });
      break;
    case "lead:create":
      await deleteLead(a.entityId, actor);
      break;
    case "lead:delete":
      await restoreLead(a.entityId, actor);
      break;
    case "lead:restore":
      await deleteLead(a.entityId, actor);
      break;
    case "company:update":
      await updateCompany(a.entityId, before, actor);
      break;
    case "company:create":
      await db.update(schema.companies).set({ deletedAt: new Date() }).where(eq(schema.companies.id, a.entityId));
      break;
    case "touchpoint:create":
      await deleteTouchpoint(a.entityId, actor);
      break;
    case "touchpoint:delete":
      await db.update(schema.touchpoints).set({ deletedAt: null }).where(eq(schema.touchpoints.id, a.entityId));
      break;
    case "signal:create":
      await db.update(schema.signals).set({ deletedAt: new Date() }).where(eq(schema.signals.id, a.entityId));
      break;
    case "action:create":
      await setActionStatus(a.entityId, "cancelled", actor, "undone");
      break;
    case "action:update":
      if ("approvedAt" in before) await approveActions([a.entityId], actor, before.approvedAt !== null);
      else if ("status" in before) await setActionStatus(a.entityId, before.status as "pending", actor, "undone");
      else await updateAction(a.entityId, before, actor);
      break;
    case "action:complete":
    case "action:skip":
      await setActionStatus(a.entityId, "pending", actor, "undone");
      break;
    case "settings:update":
      await updateSettings(before as Partial<Settings>, actor);
      break;
    default:
      throw new Error(`Can't undo ${a.entityType} ${a.action}`);
  }

  await db.update(schema.activity).set({ revertedAt: new Date() }).where(eq(schema.activity.id, a.id));
  await record({
    actor,
    entityType: a.entityType as "lead",
    entityId: a.entityId,
    action: "revert",
    summary: `Undid: ${a.summary ?? a.action}`,
  });
}

export function canRevert(a: { entityType: string; action: string; revertedAt: Date | null }) {
  if (a.revertedAt || a.action === "revert") return false;
  return [
    "lead:update",
    "lead:merge",
    "lead:create",
    "lead:delete",
    "lead:restore",
    "company:update",
    "company:create",
    "touchpoint:create",
    "touchpoint:delete",
    "signal:create",
    "action:create",
    "action:update",
    "action:complete",
    "action:skip",
    "settings:update",
  ].includes(`${a.entityType}:${a.action}`);
}
