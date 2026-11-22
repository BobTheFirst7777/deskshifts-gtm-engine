import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uuid,
  index,
  date,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** Fields a person set by hand. Automated jobs never overwrite these. */
const manualFields = () =>
  jsonb("manual_fields").$type<string[]>().notNull().default([]);

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    size: text("size"),
    industry: text("industry"),
    location: text("location"),
    fundingStage: text("funding_stage"),
    fundingNotes: text("funding_notes"),
    description: text("description"),
    manualFields: manualFields(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("companies_domain_idx").on(t.domain)],
);

export const events = pgTable("events", {
  id: id(),
  name: text("name").notNull(),
  url: text("url"),
  eventDate: date("event_date"),
  location: text("location"),
  notes: text("notes"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const leads = pgTable(
  "leads",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    eventId: uuid("event_id").references(() => events.id),
    fullName: text("full_name").notNull(),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    location: text("location"),
    source: text("source").notNull().default("manual"),
    sourceDetail: text("source_detail"),
    tier: text("tier").notNull().default("standard"),
    stage: text("stage").notNull().default("new"),
    score: integer("score"),
    priority: text("priority"),
    whyRelevant: text("why_relevant"),
    /** How this company and person relate to Deskshift (agent research). */
    relation: text("relation"),
    /** What to target them for: the angle / use case to pitch. */
    pitchAngle: text("pitch_angle"),
    /** Extra research columns agents or people add, e.g. { "Support team size": "12" }. */
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    researchedBy: text("researched_by"),
    bestChannel: text("best_channel"),
    owner: text("owner").notNull().default("ai"),
    segment: text("segment"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    /** First-message draft written by research; copied onto the first action. */
    draftMessage: text("draft_message"),
    /** LinkedIn connection request note (max 300 characters). */
    connectionNote: text("connection_note"),
    emailSubject: text("email_subject"),
    /** null = not on LinkedIn / unknown, "pending" = request sent, "connected". */
    linkedinStatus: text("linkedin_status"),
    variantId: uuid("variant_id").references(() => messageVariants.id),
    handsOff: boolean("hands_off").notNull().default(false),
    paused: boolean("paused").notNull().default(false),
    researchedAt: timestamp("researched_at", { withTimezone: true }),
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),
    manualFields: manualFields(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("leads_linkedin_idx").on(t.linkedinUrl),
    index("leads_email_idx").on(t.email),
    index("leads_stage_idx").on(t.stage),
    index("leads_company_idx").on(t.companyId),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id),
    companyId: uuid("company_id").references(() => companies.id),
    type: text("type").notNull().default("other"),
    summary: text("summary").notNull(),
    url: text("url"),
    detectedAt: timestamp("detected_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("signals_lead_idx").on(t.leadId)],
);

export const messageVariants = pgTable("message_variants", {
  id: id(),
  name: text("name").notNull(),
  angle: text("angle"),
  segment: text("segment"),
  channel: text("channel"),
  body: text("body").notNull(),
  status: text("status").notNull().default("active"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const touchpoints = pgTable(
  "touchpoints",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    channel: text("channel").notNull(),
    direction: text("direction").notNull(),
    kind: text("kind").notNull().default("message"),
    subject: text("subject"),
    content: text("content"),
    variantId: uuid("variant_id").references(() => messageVariants.id),
    replyLabel: text("reply_label"),
    batch: text("batch"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("touchpoints_lead_idx").on(t.leadId),
    index("touchpoints_occurred_idx").on(t.occurredAt),
  ],
);

export const actions = pgTable(
  "actions",
  {
    id: id(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    type: text("type").notNull(),
    channel: text("channel"),
    assignee: text("assignee").notNull().default("instinct"),
    status: text("status").notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    draft: text("draft"),
    subject: text("subject"),
    /** Set when approved; groups sends for results, e.g. "Nov 22 · LinkedIn". */
    batch: text("batch"),
    variantId: uuid("variant_id").references(() => messageVariants.id),
    reason: text("reason"),
    priority: integer("priority").notNull().default(50),
    /** In "approve first" mode, Instinct only sees tasks a person has approved. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    manualFields: manualFields(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("actions_status_idx").on(t.status, t.dueAt),
    index("actions_lead_idx").on(t.leadId),
  ],
);

export const insights = pgTable("insights", {
  id: id(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  stats: jsonb("stats").$type<Record<string, unknown>>(),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

/** Every change, by whom, with before/after so it can be undone. */
export const activity = pgTable(
  "activity",
  {
    id: id(),
    actor: text("actor").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary"),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    revertedAt: timestamp("reverted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_entity_idx").on(t.entityType, t.entityId),
    index("activity_created_idx").on(t.createdAt),
  ],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

export type Company = typeof companies.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Touchpoint = typeof touchpoints.$inferSelect;
export type Action = typeof actions.$inferSelect;
export type Variant = typeof messageVariants.$inferSelect;
export type Insight = typeof insights.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Activity = typeof activity.$inferSelect;
