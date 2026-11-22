import { and, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import type { Lead, Company } from "@/lib/db/schema";
import { isHuman, defaultHuman } from "@/lib/actors";
import {
  CHANNELS,
  LEAD_EDITABLE_FIELDS,
  PRIORITIES,
  SIGNAL_TYPES,
  STAGES,
  TIERS,
  COMPANY_EDITABLE_FIELDS,
} from "@/lib/constants";
import { record, diff } from "./activity";

// ---------- input schemas (shared by API, MCP, agent pages, dashboard) ----------

const opt = <T extends z.ZodTypeAny>(s: T) => s.nullish();
const optStr = () => z.string().trim().nullish().transform((v) => (v ? v : undefined));

export const signalInput = z.object({
  type: z.enum(SIGNAL_TYPES).catch("other").default("other"),
  summary: z.string().trim().min(1),
  url: optStr(),
});

export const leadInput = z.object({
  fullName: z.string().trim().min(1, "fullName is required"),
  title: optStr(),
  email: optStr(),
  phone: optStr(),
  linkedinUrl: optStr(),
  location: optStr(),
  company: optStr().describe("Company name"),
  companyDomain: optStr(),
  companyWebsite: optStr(),
  companyLinkedin: optStr(),
  companySize: optStr(),
  companyIndustry: optStr(),
  companyFunding: optStr(),
  companyDescription: optStr(),
  source: optStr(),
  sourceDetail: optStr(),
  event: optStr().describe("Event name, e.g. a Luma event"),
  eventUrl: optStr(),
  tier: opt(z.enum(TIERS)),
  stage: opt(z.enum(STAGES)),
  score: opt(z.coerce.number().int().min(0).max(100)),
  priority: opt(z.enum(PRIORITIES)),
  whyRelevant: optStr(),
  relation: optStr().describe("How this company and person relate to Deskshift"),
  pitchAngle: optStr().describe("What to target them for / the angle to pitch"),
  customFields: opt(z.record(z.string(), z.string())).describe("Extra research columns, e.g. {\"Support team size\": \"12\"}"),
  connectionNote: optStr().describe("LinkedIn connection request note, under 300 characters"),
  draftMessage: optStr().describe("First message (LinkedIn message after connecting, or email body)"),
  emailSubject: optStr(),
  bestChannel: opt(z.enum(CHANNELS)),
  owner: optStr(),
  segment: optStr(),
  tags: opt(z.array(z.string())),
  notes: optStr(),
  handsOff: opt(z.boolean()),
  signals: opt(z.array(signalInput)),
});
export type LeadInput = z.input<typeof leadInput>;

export const leadPatch = z
  .object({
    fullName: optStr(),
    title: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    linkedinUrl: z.string().nullish(),
    location: z.string().nullish(),
    companyId: z.string().uuid().nullish(),
    eventId: z.string().uuid().nullish(),
    source: z.string().nullish(),
    sourceDetail: z.string().nullish(),
    tier: z.enum(TIERS).nullish(),
    stage: z.enum(STAGES).nullish(),
    score: z.coerce.number().int().min(0).max(100).nullish(),
    priority: z.enum(PRIORITIES).nullish(),
    whyRelevant: z.string().nullish(),
    relation: z.string().nullish(),
    pitchAngle: z.string().nullish(),
    customFields: z.record(z.string(), z.string().nullable()).nullish(),
    connectionNote: z.string().nullish(),
    emailSubject: z.string().nullish(),
    linkedinStatus: z.enum(["pending", "connected"]).nullish(),
    bestChannel: z.enum(CHANNELS).nullish(),
    owner: z.string().nullish(),
    segment: z.string().nullish(),
    tags: z.array(z.string()).nullish(),
    notes: z.string().nullish(),
    draftMessage: z.string().nullish(),
    variantId: z.string().uuid().nullish(),
    handsOff: z.boolean().nullish(),
    paused: z.boolean().nullish(),
  })
  .partial();
export type LeadPatch = z.input<typeof leadPatch>;

// ---------- normalisation ----------

export function normalizeLinkedin(url?: string | null): string | null {
  if (!url) return null;
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^[a-z]{2}\./, "");
  u = u.split("?")[0].split("#")[0].replace(/\/+$/, "");
  if (!u.startsWith("linkedin.com")) return url.trim();
  return "https://www." + u;
}

export function normalizeDomain(input?: string | null): string | null {
  if (!input) return null;
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/^www\./, "");
  d = d.split("/")[0].split("?")[0];
  return d || null;
}

function normalizeEmail(e?: string | null) {
  return e ? e.trim().toLowerCase() : null;
}

// ---------- companies ----------

export async function findOrCreateCompany(
  input: {
    name?: string | null;
    domain?: string | null;
    website?: string | null;
    linkedinUrl?: string | null;
    size?: string | null;
    industry?: string | null;
    fundingStage?: string | null;
    description?: string | null;
  },
  actor: string,
): Promise<Company | null> {
  const db = getDb();
  const domain = normalizeDomain(input.domain ?? input.website);
  const name = input.name?.trim();
  if (!name && !domain) return null;

  let existing: Company | undefined;
  if (domain) {
    [existing] = await db
      .select()
      .from(schema.companies)
      .where(and(eq(schema.companies.domain, domain), isNull(schema.companies.deletedAt)))
      .limit(1);
  }
  if (!existing && name) {
    [existing] = await db
      .select()
      .from(schema.companies)
      .where(and(ilike(schema.companies.name, name), isNull(schema.companies.deletedAt)))
      .limit(1);
  }

  if (existing) {
    // Fill gaps only.
    const fill: Partial<Company> = {};
    if (!existing.domain && domain) fill.domain = domain;
    if (!existing.website && input.website) fill.website = input.website;
    if (!existing.linkedinUrl && input.linkedinUrl) fill.linkedinUrl = input.linkedinUrl;
    if (!existing.size && input.size) fill.size = input.size;
    if (!existing.industry && input.industry) fill.industry = input.industry;
    if (!existing.fundingStage && input.fundingStage) fill.fundingStage = input.fundingStage;
    if (!existing.description && input.description) fill.description = input.description;
    if (Object.keys(fill).length) {
      const [updated] = await db
        .update(schema.companies)
        .set({ ...fill, updatedAt: new Date() })
        .where(eq(schema.companies.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(schema.companies)
    .values({
      name: name || domain!,
      domain,
      website: input.website ?? (domain ? `https://${domain}` : null),
      linkedinUrl: input.linkedinUrl ?? null,
      size: input.size ?? null,
      industry: input.industry ?? null,
      fundingStage: input.fundingStage ?? null,
      description: input.description ?? null,
      createdBy: actor,
    })
    .returning();
  await record({
    actor,
    entityType: "company",
    entityId: created.id,
    action: "create",
    summary: `Added company ${created.name}`,
    after: created,
  });
  return created;
}

export async function updateCompany(id: string, patch: Partial<Company>, actor: string) {
  const db = getDb();
  const [current] = await db.select().from(schema.companies).where(eq(schema.companies.id, id));
  if (!current) throw new NotFound("Company not found");
  const human = isHuman(actor);
  const clean: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const k of COMPANY_EDITABLE_FIELDS) {
    if (!(k in patch)) continue;
    const v = (patch as Record<string, unknown>)[k];
    if (v === undefined) continue;
    if (!human && current.manualFields.includes(k)) {
      skipped.push(k);
      continue;
    }
    clean[k] = k === "domain" ? normalizeDomain(v as string) : v;
  }
  const d = diff(current as unknown as Record<string, unknown>, clean);
  if (!d.changed.length) return { company: current, skipped };
  const manual = human ? Array.from(new Set([...current.manualFields, ...d.changed])) : current.manualFields;
  const [updated] = await db
    .update(schema.companies)
    .set({ ...clean, manualFields: manual, updatedAt: new Date() })
    .where(eq(schema.companies.id, id))
    .returning();
  await record({
    actor,
    entityType: "company",
    entityId: id,
    action: "update",
    summary: `Updated ${updated.name}: ${d.changed.join(", ")}`,
    before: d.before,
    after: d.after,
  });
  return { company: updated, skipped };
}

// ---------- events ----------

export async function findOrCreateEvent(
  input: { name?: string | null; url?: string | null; date?: string | null; location?: string | null },
  actor: string,
) {
  const db = getDb();
  const name = input.name?.trim();
  if (!name && !input.url) return null;
  const conds: SQL[] = [];
  if (input.url) conds.push(eq(schema.events.url, input.url));
  if (name) conds.push(ilike(schema.events.name, name));
  const [existing] = await db
    .select()
    .from(schema.events)
    .where(and(or(...conds), isNull(schema.events.deletedAt)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.events)
    .values({
      name: name || input.url!,
      url: input.url ?? null,
      eventDate: input.date ?? null,
      location: input.location ?? null,
      createdBy: actor,
    })
    .returning();
  await record({
    actor,
    entityType: "event",
    entityId: created.id,
    action: "create",
    summary: `Added event ${created.name}`,
    after: created,
  });
  return created;
}

// ---------- leads ----------

export class NotFound extends Error {
  status = 404;
}

export async function findDuplicate(input: {
  linkedinUrl?: string | null;
  email?: string | null;
  fullName?: string | null;
  companyId?: string | null;
}): Promise<Lead | undefined> {
  const db = getDb();
  const li = normalizeLinkedin(input.linkedinUrl);
  const email = normalizeEmail(input.email);
  const conds: SQL[] = [];
  if (li) conds.push(eq(schema.leads.linkedinUrl, li));
  if (email) conds.push(sql`lower(${schema.leads.email}) = ${email}`);
  if (input.fullName && input.companyId)
    conds.push(and(ilike(schema.leads.fullName, input.fullName.trim()), eq(schema.leads.companyId, input.companyId))!);
  if (!conds.length) return undefined;
  const [row] = await db
    .select()
    .from(schema.leads)
    .where(and(or(...conds), isNull(schema.leads.deletedAt)))
    .limit(1);
  return row;
}

export type AddLeadResult = { lead: Lead; created: boolean; filled: string[] };

/**
 * Add a lead from any source. Duplicates (same LinkedIn, email, or name at the same
 * company) are merged: empty fields are filled, nothing a person set is overwritten.
 */
export async function addLead(raw: LeadInput, actor: string): Promise<AddLeadResult> {
  const input = leadInput.parse(raw);
  const db = getDb();

  const company = await findOrCreateCompany(
    {
      name: input.company,
      domain: input.companyDomain,
      website: input.companyWebsite,
      linkedinUrl: input.companyLinkedin,
      size: input.companySize,
      industry: input.companyIndustry,
      fundingStage: input.companyFunding,
      description: input.companyDescription,
    },
    actor,
  );
  const event = await findOrCreateEvent({ name: input.event, url: input.eventUrl }, actor);

  const source = input.source || (isHuman(actor) ? "manual" : actor);
  const values = {
    fullName: input.fullName,
    title: input.title ?? null,
    email: normalizeEmail(input.email),
    phone: input.phone ?? null,
    linkedinUrl: normalizeLinkedin(input.linkedinUrl),
    location: input.location ?? null,
    companyId: company?.id ?? null,
    eventId: event?.id ?? null,
    source,
    sourceDetail: input.sourceDetail ?? (event ? `Event: ${event.name}` : null),
    tier: input.tier ?? (event ? "event" : "standard"),
    stage: input.stage ?? "new",
    score: input.score ?? null,
    priority: input.priority ?? null,
    whyRelevant: input.whyRelevant ?? null,
    relation: input.relation ?? null,
    pitchAngle: input.pitchAngle ?? null,
    customFields: input.customFields ?? {},
    connectionNote: input.connectionNote ?? null,
    draftMessage: input.draftMessage ?? null,
    emailSubject: input.emailSubject ?? null,
    bestChannel: input.bestChannel ?? null,
    owner: input.owner ?? (input.handsOff && isHuman(actor) ? actor : "ai"),
    segment: input.segment ?? null,
    tags: input.tags ?? [],
    notes: input.notes ?? null,
    handsOff: input.handsOff ?? false,
  };

  const dup = await findDuplicate({
    linkedinUrl: values.linkedinUrl,
    email: values.email,
    fullName: values.fullName,
    companyId: values.companyId,
  });

  if (dup) {
    const fill: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === null || v === undefined) continue;
      if (Array.isArray(v) && !v.length) continue;
      if (k === "customFields") {
        const add = Object.fromEntries(
          Object.entries(v as Record<string, string>).filter(([ck]) => !(ck in dup.customFields) && !dup.manualFields.includes(`custom:${ck}`)),
        );
        if (Object.keys(add).length) fill.customFields = { ...dup.customFields, ...add };
        continue;
      }
      const cur = (dup as Record<string, unknown>)[k];
      const empty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && !cur.length);
      if (empty && !dup.manualFields.includes(k)) fill[k] = v;
    }
    // Notes from a second source are appended, not dropped.
    if (values.notes && dup.notes && !dup.notes.includes(values.notes)) {
      fill.notes = `${dup.notes}\n\n[${actor}] ${values.notes}`;
    }
    delete fill.stage;
    delete fill.source;
    let lead = dup;
    if (Object.keys(fill).length) {
      const [u] = await db
        .update(schema.leads)
        .set({ ...fill, updatedAt: new Date() })
        .where(eq(schema.leads.id, dup.id))
        .returning();
      lead = u;
      await record({
        actor,
        entityType: "lead",
        entityId: dup.id,
        action: "merge",
        summary: `${actor} re-added ${dup.fullName}; filled ${Object.keys(fill).join(", ")}`,
        before: Object.fromEntries(Object.keys(fill).map((k) => [k, (dup as Record<string, unknown>)[k] ?? null])),
        after: fill,
      });
    }
    if (input.signals?.length) await addSignals(lead.id, input.signals, actor);
    return { lead, created: false, filled: Object.keys(fill) };
  }

  const manual = isHuman(actor)
    ? Object.entries(values)
        .filter(
          ([k, v]) =>
            v !== null &&
            !(Array.isArray(v) && !v.length) &&
            !["stage", "source", "tier", "owner", "handsOff", "customFields"].includes(k),
        )
        .map(([k]) => k)
        .concat(Object.keys(values.customFields).map((ck) => `custom:${ck}`))
    : [];

  const [lead] = await db
    .insert(schema.leads)
    .values({ ...values, manualFields: manual, createdBy: actor })
    .returning();
  await record({
    actor,
    entityType: "lead",
    entityId: lead.id,
    action: "create",
    summary: `Added lead ${lead.fullName}${company ? ` (${company.name})` : ""} via ${source}`,
    after: lead,
  });
  if (input.signals?.length) await addSignals(lead.id, input.signals, actor);
  return { lead, created: true, filled: [] };
}

export async function addSignals(
  leadId: string,
  list: z.input<typeof signalInput>[],
  actor: string,
) {
  const db = getDb();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) throw new NotFound("Lead not found");
  const existing = await db.select().from(schema.signals).where(eq(schema.signals.leadId, leadId));
  const out = [];
  for (const raw of list) {
    const s = signalInput.parse(raw);
    if (existing.some((e) => e.summary === s.summary || (s.url && e.url === s.url))) continue;
    const [row] = await db
      .insert(schema.signals)
      .values({
        leadId,
        companyId: lead.companyId,
        type: s.type,
        summary: s.summary,
        url: s.url ?? null,
        detectedAt: new Date(),
        createdBy: actor,
      })
      .returning();
    await record({
      actor,
      entityType: "signal",
      entityId: row.id,
      action: "create",
      summary: `Signal on ${lead.fullName}: ${s.summary.slice(0, 80)}`,
      after: row,
    });
    out.push(row);
  }
  return out;
}

export async function getLead(id: string) {
  const db = getDb();
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  return lead;
}

export type UpdateResult = { lead: Lead; changed: string[]; skipped: string[] };

/**
 * Update a lead. People can change anything, and what they change is marked manual.
 * Agents and jobs can't overwrite manual fields; those are reported back as skipped.
 */
export async function updateLead(
  id: string,
  rawPatch: LeadPatch,
  actor: string,
  opts: { force?: boolean } = {},
): Promise<UpdateResult> {
  const db = getDb();
  const current = await getLead(id);
  if (!current || current.deletedAt) throw new NotFound("Lead not found");
  const patch = leadPatch.parse(rawPatch) as Record<string, unknown>;
  const human = isHuman(actor) || opts.force;

  const clean: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const k of LEAD_EDITABLE_FIELDS) {
    if (!(k in patch) || patch[k] === undefined) continue;
    if (!human && current.manualFields.includes(k)) {
      skipped.push(k);
      continue;
    }
    let v = patch[k];
    if (k === "customFields") {
      const next = { ...current.customFields };
      for (const [ck, cv] of Object.entries((v ?? {}) as Record<string, string | null>)) {
        if (!human && current.manualFields.includes(`custom:${ck}`)) {
          skipped.push(`custom:${ck}`);
          continue;
        }
        if (cv === null || cv === "") delete next[ck];
        else next[ck] = cv;
      }
      clean.customFields = next;
      continue;
    }
    if (k === "linkedinUrl") v = normalizeLinkedin(v as string);
    if (k === "email") v = normalizeEmail(v as string);
    if (k === "tags" && v === null) v = [];
    if (k === "handsOff" || k === "paused") v = Boolean(v);
    clean[k] = v;
  }

  const d = diff(current as unknown as Record<string, unknown>, clean);
  if (!d.changed.length) return { lead: current, changed: [], skipped };

  let manualChanged = d.changed.filter((k) => !["paused", "linkedinStatus", "customFields"].includes(k));
  if (d.changed.includes("customFields")) {
    const before = (d.before.customFields ?? {}) as Record<string, string>;
    const after = (d.after.customFields ?? {}) as Record<string, string>;
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    manualChanged = manualChanged.concat([...keys].filter((ck) => before[ck] !== after[ck]).map((ck) => `custom:${ck}`));
  }
  const manual = isHuman(actor)
    ? Array.from(new Set([...current.manualFields, ...manualChanged]))
    : current.manualFields;

  const [lead] = await db
    .update(schema.leads)
    .set({ ...d.after, manualFields: manual, updatedAt: new Date() })
    .where(eq(schema.leads.id, id))
    .returning();

  await record({
    actor,
    entityType: "lead",
    entityId: id,
    action: "update",
    summary: `Updated ${lead.fullName}: ${d.changed.join(", ")}`,
    before: d.before,
    after: d.after,
  });

  if (["handsOff", "owner", "paused"].some((k) => d.changed.includes(k))) {
    await reassignPendingActions(lead);
  }
  if (d.changed.includes("stage") && (lead.stage === "won" || lead.stage === "lost")) {
    await cancelPendingActions(lead.id, actor, `Lead marked ${lead.stage}`);
  }
  return { lead, changed: d.changed, skipped };
}

/** Who should do outbound work for this lead right now. */
export function assigneeFor(lead: Pick<Lead, "handsOff" | "owner">): string {
  if (lead.owner && lead.owner !== "ai") return lead.owner;
  if (lead.handsOff) return defaultHuman();
  return "instinct";
}

export async function reassignPendingActions(lead: Lead) {
  const db = getDb();
  const outbound = ["send_first", "follow_up", "connect", "call"];
  const target = assigneeFor(lead);
  await db
    .update(schema.actions)
    .set({ assignee: target, updatedAt: new Date() })
    .where(
      and(
        eq(schema.actions.leadId, lead.id),
        eq(schema.actions.status, "pending"),
        inArray(schema.actions.type, outbound),
      ),
    );
}

export async function cancelPendingActions(leadId: string, actor: string, reason: string, types?: string[]) {
  const db = getDb();
  const conds = [eq(schema.actions.leadId, leadId), eq(schema.actions.status, "pending")];
  if (types?.length) conds.push(inArray(schema.actions.type, types));
  const rows = await db
    .update(schema.actions)
    .set({ status: "cancelled", completedAt: new Date(), completedBy: actor, reason, updatedAt: new Date() })
    .where(and(...conds))
    .returning();
  return rows;
}

export async function deleteLead(id: string, actor: string) {
  const db = getDb();
  const lead = await getLead(id);
  if (!lead || lead.deletedAt) throw new NotFound("Lead not found");
  await db.update(schema.leads).set({ deletedAt: new Date() }).where(eq(schema.leads.id, id));
  await cancelPendingActions(id, actor, "Lead deleted");
  await record({ actor, entityType: "lead", entityId: id, action: "delete", summary: `Deleted ${lead.fullName}` });
}

export async function restoreLead(id: string, actor: string) {
  const db = getDb();
  const lead = await getLead(id);
  if (!lead) throw new NotFound("Lead not found");
  await db.update(schema.leads).set({ deletedAt: null }).where(eq(schema.leads.id, id));
  await record({ actor, entityType: "lead", entityId: id, action: "restore", summary: `Restored ${lead.fullName}` });
}

// ---------- reading ----------

export type LeadFilters = {
  q?: string;
  stage?: string;
  tier?: string;
  source?: string;
  owner?: string;
  eventId?: string;
  companyId?: string;
  limit?: number;
  offset?: number;
  sort?: "recent" | "score" | "touched";
};

export async function listLeads(f: LeadFilters = {}) {
  const db = getDb();
  const conds: SQL[] = [isNull(schema.leads.deletedAt)];
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(
      or(
        ilike(schema.leads.fullName, like),
        ilike(schema.leads.email, like),
        ilike(schema.leads.title, like),
        ilike(schema.leads.linkedinUrl, like),
        ilike(schema.companies.name, like),
        ilike(schema.companies.domain, like),
      )!,
    );
  }
  if (f.stage) conds.push(eq(schema.leads.stage, f.stage));
  if (f.tier) conds.push(eq(schema.leads.tier, f.tier));
  if (f.source) conds.push(eq(schema.leads.source, f.source));
  if (f.owner) conds.push(eq(schema.leads.owner, f.owner));
  if (f.eventId) conds.push(eq(schema.leads.eventId, f.eventId));
  if (f.companyId) conds.push(eq(schema.leads.companyId, f.companyId));

  const order =
    f.sort === "score"
      ? [sql`${schema.leads.score} desc nulls last`, desc(schema.leads.createdAt)]
      : f.sort === "touched"
        ? [sql`${schema.leads.lastTouchAt} desc nulls last`]
        : [desc(schema.leads.createdAt)];

  const rows = await db
    .select({ lead: schema.leads, company: schema.companies })
    .from(schema.leads)
    .leftJoin(schema.companies, eq(schema.leads.companyId, schema.companies.id))
    .where(and(...conds))
    .orderBy(...order)
    .limit(Math.min(f.limit ?? 100, 500))
    .offset(f.offset ?? 0);
  return rows;
}

export async function getLeadDetail(id: string) {
  const db = getDb();
  const lead = await getLead(id);
  if (!lead) return null;
  const [company] = lead.companyId
    ? await db.select().from(schema.companies).where(eq(schema.companies.id, lead.companyId))
    : [];
  const [event] = lead.eventId
    ? await db.select().from(schema.events).where(eq(schema.events.id, lead.eventId))
    : [];
  const signals = await db
    .select()
    .from(schema.signals)
    .where(and(eq(schema.signals.leadId, id), isNull(schema.signals.deletedAt)))
    .orderBy(desc(schema.signals.createdAt));
  const touchpoints = await db
    .select()
    .from(schema.touchpoints)
    .where(and(eq(schema.touchpoints.leadId, id), isNull(schema.touchpoints.deletedAt)))
    .orderBy(desc(schema.touchpoints.occurredAt));
  const actions = await db
    .select()
    .from(schema.actions)
    .where(eq(schema.actions.leadId, id))
    .orderBy(desc(schema.actions.createdAt));
  return { lead, company: company ?? null, event: event ?? null, signals, touchpoints, actions };
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLeadDetail>>>;

/**
 * Find a lead from loose references an agent might give: id, LinkedIn URL, email or name.
 */
export async function resolveLead(ref: {
  id?: string | null;
  linkedinUrl?: string | null;
  email?: string | null;
  name?: string | null;
  company?: string | null;
}): Promise<Lead | undefined> {
  const db = getDb();
  if (ref.id && /^[0-9a-f-]{36}$/i.test(ref.id)) {
    const l = await getLead(ref.id);
    if (l && !l.deletedAt) return l;
  }
  const dup = await findDuplicate({ linkedinUrl: ref.linkedinUrl, email: ref.email });
  if (dup) return dup;
  if (ref.name) {
    const conds: SQL[] = [isNull(schema.leads.deletedAt), ilike(schema.leads.fullName, `%${ref.name.trim()}%`)];
    if (ref.company) conds.push(ilike(schema.companies.name, `%${ref.company.trim()}%`));
    const rows = await db
      .select({ lead: schema.leads })
      .from(schema.leads)
      .leftJoin(schema.companies, eq(schema.leads.companyId, schema.companies.id))
      .where(and(...conds))
      .limit(2);
    if (rows.length === 1) return rows[0].lead;
    if (rows.length > 1 && !ref.company) return undefined; // ambiguous
    if (rows.length) return rows[0].lead;
  }
  return undefined;
}

/** One query that returns everything about matching companies and people. */
export async function searchEverything(q: string, limit = 10) {
  const rows = await listLeads({ q, limit });
  const details = [];
  for (const r of rows) {
    const d = await getLeadDetail(r.lead.id);
    if (d) details.push(d);
  }
  return details;
}

export async function listEvents() {
  const db = getDb();
  const evs = await db
    .select()
    .from(schema.events)
    .where(isNull(schema.events.deletedAt))
    .orderBy(desc(schema.events.createdAt));
  const counts = await db
    .select({ eventId: schema.leads.eventId, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(isNull(schema.leads.deletedAt))
    .groupBy(schema.leads.eventId);
  return evs.map((e) => ({ ...e, leadCount: counts.find((c) => c.eventId === e.id)?.n ?? 0 }));
}
