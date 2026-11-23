import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { record } from "./activity";

export type Settings = {
  automationPaused: boolean;
  /** approve = Instinct only sends tasks a person approved; auto = it sends everything assigned to it. */
  instinctMode: "approve" | "auto";
  linkedinDailyLimit: number;
  /** Instinct's phone number or handle, for the "Text Instinct" button. */
  instinctContact: string;
  instinctContactVia: "imessage" | "whatsapp";
  /** Last time Instinct opened its Send page (set automatically). */
  instinctLastCheckedAt: string | null;
  /** Who writes outreach drafts: "chatgpt" = only ChatGPT; "any" = whichever agent researches. */
  draftWriter: "chatgpt" | "any";
  /** Days to wait for a LinkedIn connection to be accepted before trying email or moving on. */
  connectionGiveUpDays: number;
  dailyTarget: number;
  followUpDays: number;
  maxFollowUps: number;
  icp: string;
  pitch: string;
  /** Standing instructions for agents that find leads (nightly or on request). */
  sourcingBrief: string;
  nightlyLeadTarget: number;
};

export const DEFAULT_SETTINGS: Settings = {
  automationPaused: false,
  instinctMode: "approve",
  linkedinDailyLimit: 25,
  connectionGiveUpDays: 14,
  draftWriter: "chatgpt",
  instinctContact: "",
  instinctContactVia: "imessage",
  instinctLastCheckedAt: null,
  dailyTarget: 30,
  followUpDays: 3,
  maxFollowUps: 2,
  icp:
    "B2B SaaS companies (seed to Series C, roughly 10-500 employees), mostly in the US/SF, whose product has a real onboarding, support or product-demo load: complex dashboards, many new users, rising support tickets. Best contacts: founders, CEOs, heads of customer success, support, growth or product.",
  nightlyLeadTarget: 30,
  sourcingBrief:
    "Find people at B2B SaaS companies that match who we sell to. Prefer signals from the last 60 days: new funding, hiring support/CS/onboarding roles, posts about onboarding drop-off, support load or demo bottlenecks, attending SaaS events. Good sources: LinkedIn, Luma event guest lists, Crunchbase/TechCrunch funding news, job boards, company blogs. For each person give their LinkedIn URL, title, company website, and why they fit, with links. Skip anyone already in the engine, agencies, and companies under 5 people.",
  pitch:
    "Deskshift builds Dex, a voice-first AI employee that lives inside a SaaS product and handles onboarding, live how-to help, support ticket routing and product demos for every user.",
};

export async function getSettings(): Promise<Settings> {
  const db = getDb();
  const rows = await db.select().from(schema.settings);
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function updateSettings(patch: Partial<Settings>, actor: string) {
  const db = getDb();
  const before = await getSettings();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (existing.length) {
      await db
        .update(schema.settings)
        .set({ value, updatedAt: new Date() })
        .where(eq(schema.settings.key, key));
    } else {
      await db.insert(schema.settings).values({ key, value });
    }
  }
  const changed = Object.fromEntries(
    Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]]),
  );
  await record({
    actor,
    entityType: "settings",
    entityId: "00000000-0000-0000-0000-000000000000",
    action: "update",
    summary: `Changed settings: ${Object.keys(patch).join(", ")}`,
    before: changed,
    after: patch as Record<string, unknown>,
  });
  return getSettings();
}

/** Record a setting the system itself maintains, without an activity entry. */
export async function touchSetting(key: keyof Settings, value: unknown) {
  const db = getDb();
  const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  if (existing.length) await db.update(schema.settings).set({ value, updatedAt: new Date() }).where(eq(schema.settings.key, key));
  else await db.insert(schema.settings).values({ key, value });
}
