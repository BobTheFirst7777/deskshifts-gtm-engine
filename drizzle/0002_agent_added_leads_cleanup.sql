-- Leads added by agents should not be hands-off or owned by a person (only people decide that),
-- and should not be marked Researched until research is actually saved.
UPDATE "leads"
SET "hands_off" = false, "owner" = 'ai'
WHERE "created_by" IN ('chatgpt', 'claude', 'instinct', 'system')
  AND ("hands_off" = true OR "owner" <> 'ai')
  AND NOT ("manual_fields" ? 'handsOff')
  AND NOT ("manual_fields" ? 'owner');
--> statement-breakpoint
UPDATE "leads"
SET "stage" = 'new'
WHERE "stage" = 'researched'
  AND "researched_at" IS NULL
  AND "created_by" IN ('chatgpt', 'claude', 'instinct', 'system');
--> statement-breakpoint
-- Tasks that were queued for those leads before research go back to being unqueued.
UPDATE "actions"
SET "status" = 'cancelled', "reason" = 'Queued before research; will be re-queued after research'
WHERE "status" = 'pending'
  AND "type" IN ('connect', 'send_first')
  AND "lead_id" IN (SELECT "id" FROM "leads" WHERE "researched_at" IS NULL);
