import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { record } from "./activity";

export type Settings = {
  automationPaused: boolean;
  /** approve = Instinct only sends tasks a person approved; auto = it sends everything assigned to it. */
  instinctMode: "approve" | "auto";
  linkedinDailyLimit: number;
  dailyTarget: number;
  followUpDays: number;
  maxFollowUps: number;
  icp: string;
  pitch: string;
};

export const DEFAULT_SETTINGS: Settings = {
  automationPaused: false,
  instinctMode: "approve",
  linkedinDailyLimit: 25,
  dailyTarget: 30,
  followUpDays: 3,
  maxFollowUps: 2,
  icp:
    "B2B SaaS companies (seed to Series C, roughly 10-500 employees), mostly in the US/SF, whose product has a real onboarding, support or product-demo load: complex dashboards, many new users, rising support tickets. Best contacts: founders, CEOs, heads of customer success, support, growth or product.",
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
