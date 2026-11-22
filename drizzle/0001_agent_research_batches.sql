ALTER TABLE "actions" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "batch" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "relation" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pitch_angle" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "researched_by" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "connection_note" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "email_subject" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "linkedin_status" text;--> statement-breakpoint
ALTER TABLE "touchpoints" ADD COLUMN "batch" text;