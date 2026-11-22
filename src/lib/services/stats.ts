import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

const days = (n: number) => new Date(Date.now() - n * 86400_000);

export async function overview() {
  const db = getDb();
  const live = isNull(schema.leads.deletedAt);

  const byStage = await db
    .select({ stage: schema.leads.stage, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(live)
    .groupBy(schema.leads.stage);
  const bySource = await db
    .select({ source: schema.leads.source, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(live)
    .groupBy(schema.leads.source);

  const [{ n: total }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.leads).where(live);
  const [{ n: added7 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(live, gte(schema.leads.createdAt, days(7))));

  const touches = (dir: "out" | "in", since: Date) =>
    db
      .select({ n: sql<number>`count(distinct ${schema.touchpoints.leadId})::int` })
      .from(schema.touchpoints)
      .where(
        and(
          eq(schema.touchpoints.direction, dir),
          isNull(schema.touchpoints.deletedAt),
          sql`${schema.touchpoints.kind} not in ('note', 'connection_request', 'connection_accepted')`,
          gte(schema.touchpoints.occurredAt, since),
        ),
      );
  const [{ n: contacted7 }] = await touches("out", days(7));
  const [{ n: replied7 }] = await touches("in", days(7));

  // Reply rate over 30 days: of leads first contacted in the window, how many replied after.
  const rr = await db.execute<{ contacted: number; replied: number }>(sql`
    with firsts as (
      select lead_id, min(occurred_at) as first_out
      from touchpoints
      where direction = 'out' and kind not in ('note', 'connection_request', 'connection_accepted') and deleted_at is null
      group by lead_id
      having min(occurred_at) >= ${days(30).toISOString()}
    )
    select count(*)::int as contacted,
      count(*) filter (where exists (
        select 1 from touchpoints t where t.lead_id = firsts.lead_id and t.direction = 'in' and t.kind <> 'connection_accepted'
          and t.deleted_at is null and t.occurred_at >= firsts.first_out))::int as replied
    from firsts`);
  const rrRow = rows<{ contacted: number; replied: number }>(rr)[0] ?? { contacted: 0, replied: 0 };

  const stage = (s: string) => byStage.find((r) => r.stage === s)?.n ?? 0;
  return {
    total,
    added7,
    contacted7,
    replied7,
    meetings: stage("meeting") + stage("won"),
    replyRate30: rrRow.contacted ? rrRow.replied / rrRow.contacted : null,
    contacted30: rrRow.contacted,
    replied30: rrRow.replied,
    byStage,
    bySource,
  };
}

export type BreakdownRow = { key: string | null; label: string | null; contacted: number; replied: number; rate: number | null };

/**
 * Reply rate by message version, channel, tier or segment. A lead counts once, by
 * its first outbound message; it counts as replied if any reply came after.
 */
export async function replyBreakdown(by: "variant" | "channel" | "tier" | "segment" | "source", sinceDays = 90) {
  const db = getDb();
  const keyExpr = {
    variant: sql`f.variant_id::text`,
    channel: sql`f.channel`,
    tier: sql`l.tier`,
    segment: sql`l.segment`,
    source: sql`l.source`,
  }[by];
  const labelExpr = by === "variant" ? sql`v.name` : keyExpr;
  const res = await db.execute<{ key: string | null; label: string | null; contacted: number; replied: number }>(sql`
    with firsts as (
      select distinct on (lead_id) lead_id, occurred_at, channel, variant_id
      from touchpoints
      where direction = 'out' and kind not in ('note', 'connection_request', 'connection_accepted') and deleted_at is null
      order by lead_id, occurred_at asc
    )
    select ${keyExpr} as key, ${labelExpr} as label,
      count(*)::int as contacted,
      count(*) filter (where exists (
        select 1 from touchpoints t where t.lead_id = f.lead_id and t.direction = 'in' and t.kind <> 'connection_accepted'
          and t.deleted_at is null and t.occurred_at >= f.occurred_at))::int as replied
    from firsts f
    join leads l on l.id = f.lead_id
    left join message_variants v on v.id = f.variant_id
    where f.occurred_at >= ${days(sinceDays).toISOString()}
    group by 1, 2
    order by 3 desc`);
  return rows<{ key: string | null; label: string | null; contacted: number; replied: number }>(res).map((r) => ({ ...r, rate: r.contacted ? r.replied / r.contacted : null })) as BreakdownRow[];
}

/** pg returns { rows }, PGlite returns { rows } too; this guards either shape. */
function rows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  return ((res as { rows?: T[] }).rows ?? []) as T[];
}
