export const STAGES = [
  "new",
  "researched",
  "contacted",
  "replied",
  "meeting",
  "won",
  "lost",
  "nurture",
] as const;
export type Stage = (typeof STAGES)[number];

/** Order used so automated events only ever move a lead forward. */
export const STAGE_RANK: Record<Stage, number> = {
  new: 0,
  researched: 1,
  contacted: 2,
  replied: 3,
  meeting: 4,
  won: 5,
  lost: 5,
  nurture: 2,
};

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New",
  researched: "Researched",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
  nurture: "Nurture",
};

export const TIERS = ["standard", "high_value", "event"] as const;
export const TIER_LABEL: Record<string, string> = {
  standard: "Standard",
  high_value: "High value",
  event: "Event",
};

export const CHANNELS = ["linkedin", "email", "sms", "call", "in_person", "other"] as const;
export const CHANNEL_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  email: "Email",
  sms: "SMS",
  call: "Call",
  in_person: "In person",
  other: "Other",
};

export const SOURCES = [
  "manual",
  "chatgpt",
  "claude",
  "instinct",
  "apollo",
  "luma",
  "linkedin",
  "import",
  "system",
] as const;

export const TOUCH_KINDS = [
  "message",
  "connection_request",
  "connection_accepted",
  "call",
  "meeting",
  "note",
] as const;

export const REPLY_LABELS = [
  "interested",
  "not_now",
  "objection",
  "wrong_person",
  "unsubscribe",
  "other",
] as const;
export const REPLY_LABEL_TEXT: Record<string, string> = {
  interested: "Interested",
  not_now: "Not now",
  objection: "Objection",
  wrong_person: "Wrong person",
  unsubscribe: "Unsubscribe",
  other: "Other",
};

export const ACTION_TYPES = [
  "send_first",
  "follow_up",
  "respond",
  "connect",
  "call",
  "research",
  "custom",
] as const;
export const ACTION_LABEL: Record<string, string> = {
  send_first: "First message",
  follow_up: "Follow-up",
  respond: "Respond to reply",
  connect: "Connection request",
  call: "Call",
  research: "Research",
  custom: "Task",
};

export const SIGNAL_TYPES = [
  "funding",
  "post",
  "hiring",
  "event",
  "news",
  "product",
  "other",
] as const;

export const PRIORITIES = ["high", "medium", "low"] as const;

/** Lead fields that people and agents may edit. */
export const LEAD_EDITABLE_FIELDS = [
  "fullName",
  "title",
  "email",
  "phone",
  "linkedinUrl",
  "location",
  "companyId",
  "eventId",
  "source",
  "sourceDetail",
  "tier",
  "stage",
  "score",
  "priority",
  "whyRelevant",
  "relation",
  "pitchAngle",
  "customFields",
  "connectionNote",
  "emailSubject",
  "linkedinStatus",
  "bestChannel",
  "owner",
  "segment",
  "tags",
  "notes",
  "draftMessage",
  "variantId",
  "handsOff",
  "paused",
] as const;
export type LeadEditableField = (typeof LEAD_EDITABLE_FIELDS)[number];

export const COMPANY_EDITABLE_FIELDS = [
  "name",
  "domain",
  "website",
  "linkedinUrl",
  "size",
  "industry",
  "location",
  "fundingStage",
  "fundingNotes",
  "description",
] as const;
