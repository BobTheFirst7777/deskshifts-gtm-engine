import Link from "next/link";
import { and, desc, eq, gte, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { humanNames } from "@/lib/actors";
import { listQueue, reviewQueue } from "@/lib/services/actions";
import { researchQueue } from "@/lib/services/research";
import { overview } from "@/lib/services/stats";
import { getSettings } from "@/lib/services/settings";
import { aiEnabled } from "@/lib/ai";
import { CHANNEL_LABEL, REPLY_LABEL_TEXT, STAGES, STAGE_LABEL } from "@/lib/constants";
import { TaskRow } from "@/components/task-row";
import { Button, Card, Empty, Flash, Kpi, PageHeader, pct, timeAgo } from "@/components/ui";
import { runJob } from "./actions";
import { TextInstinct } from "@/components/text-instinct";

export const metadata = { title: "Today" };

export default async function Today({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const [queue, ov, settings, toReview, toResearch] = await Promise.all([listQueue(), overview(), getSettings(), reviewQueue(), researchQueue(200)]);

  const people = humanNames();
  const mine = queue.filter((q) => q.action.assignee === user);
  const teammates = queue.filter((q) => people.includes(q.action.assignee) && q.action.assignee !== user);
  const instinct = queue.filter((q) => q.action.assignee === "instinct");

  const replies = await db
    .select({ tp: schema.touchpoints, lead: schema.leads })
    .from(schema.touchpoints)
    .innerJoin(schema.leads, eq(schema.touchpoints.leadId, schema.leads.id))
    .where(and(eq(schema.touchpoints.direction, "in"), ne(schema.touchpoints.kind, "connection_accepted"), isNull(schema.touchpoints.deletedAt), gte(schema.touchpoints.occurredAt, new Date(Date.now() - 7 * 86400_000))))
    .orderBy(desc(schema.touchpoints.occurredAt))
    .limit(8);

  const stageCount = (s: string) => ov.byStage.find((r) => r.stage === s)?.n ?? 0;
  const maxStage = Math.max(1, ...STAGES.map(stageCount));
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-6xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader
        title="Today"
        subtitle={today}
        actions={
          <form action={runJob}>
            <input type="hidden" name="job" value="queue" />
            <Button tone="secondary">Build today&apos;s queue now</Button>
          </form>
        }
      />

      {!aiEnabled() && (
        <div className="mb-5 rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Research, drafts and plain-English logging are off until <code className="font-mono text-xs">OPENAI_API_KEY</code> is set. Everything else works.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Leads" value={ov.total} sub={`+${ov.added7} this week`} />
        <Kpi label="Contacted, 7d" value={ov.contacted7} />
        <Kpi label="Replied, 7d" value={ov.replied7} />
        <Kpi label="Reply rate, 30d" value={pct(ov.replyRate30)} sub={`${ov.replied30} of ${ov.contacted30}`} />
        <Kpi label="Meetings" value={ov.meetings} />
        <Kpi label="Queued today" value={queue.length} sub={`${instinct.length} for Instinct`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Needs you (${mine.length})`} padded={false}>
            {mine.length ? (
              <ul className="divide-y divide-zinc-100">{mine.map((q) => <TaskRow key={q.action.id} {...q} />)}</ul>
            ) : (
              <Empty>Nothing waiting on you.</Empty>
            )}
          </Card>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href="/review" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300">
              <p className="text-xs font-medium text-zinc-500">Waiting for your approval</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{toReview.length}</p>
              <p className="mt-0.5 text-xs text-accent-600">Review &amp; send →</p>
            </Link>
            <Link href="/leads?stage=new" className="rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300">
              <p className="text-xs font-medium text-zinc-500">New leads waiting for research</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{toResearch.length}</p>
              <p className="mt-0.5 text-xs text-zinc-500">ChatGPT and Instinct pick these up</p>
            </Link>
          </div>

          <TextInstinct waiting={instinct.filter((q) => q.action.approvedAt || settings.instinctMode === "auto").length} compact />

          <Card title={`Approved, waiting for Instinct to send (${instinct.filter((q) => q.action.approvedAt || settings.instinctMode === "auto").length})`} padded={false}>
            {instinct.filter((q) => q.action.approvedAt || settings.instinctMode === "auto").length ? (
              <ul className="divide-y divide-zinc-100">
                {instinct
                  .filter((q) => q.action.approvedAt || settings.instinctMode === "auto")
                  .map((q) => <TaskRow key={q.action.id} {...q} showApproval={settings.instinctMode === "approve"} />)}
              </ul>
            ) : (
              <Empty>Nothing approved and unsent. Approve messages on Review &amp; send.</Empty>
            )}
          </Card>

          {teammates.length > 0 && (
            <Card title={`Teammates (${teammates.length})`} padded={false}>
              <ul className="divide-y divide-zinc-100">{teammates.map((q) => <TaskRow key={q.action.id} {...q} />)}</ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Recent replies" padded={false}>
            {replies.length ? (
              <ul className="divide-y divide-zinc-100">
                {replies.map(({ tp, lead }) => (
                  <li key={tp.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/leads/${lead.id}`} className="truncate text-sm font-medium hover:underline">{lead.fullName}</Link>
                      <span className="shrink-0 text-xs text-zinc-400">{timeAgo(tp.occurredAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {CHANNEL_LABEL[tp.channel]}{tp.replyLabel ? ` · ${REPLY_LABEL_TEXT[tp.replyLabel]}` : ""}
                    </p>
                    {tp.content && <p className="mt-1 line-clamp-2 text-sm text-zinc-700">“{tp.content}”</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No replies this week yet.</Empty>
            )}
          </Card>

          <Card title="Pipeline">
            <ul className="space-y-1.5">
              {STAGES.map((s) => (
                <li key={s}>
                  <Link href={`/leads?stage=${s}`} className="group flex items-center gap-2 text-sm">
                    <span className="w-20 text-zinc-600 group-hover:text-zinc-900">{STAGE_LABEL[s]}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <span className="block h-full rounded-full bg-zinc-800" style={{ width: `${(stageCount(s) / maxStage) * 100}%` }} />
                    </span>
                    <span className="w-8 text-right tabular-nums text-zinc-700">{stageCount(s)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Where leads come from">
            <ul className="space-y-1 text-sm">
              {ov.bySource.sort((a, b) => b.n - a.n).map((s) => (
                <li key={s.source} className="flex justify-between">
                  <Link href={`/leads?source=${s.source}`} className="text-zinc-600 hover:text-zinc-900">{s.source}</Link>
                  <span className="tabular-nums">{s.n}</span>
                </li>
              ))}
              {!ov.bySource.length && <li className="text-zinc-500">No leads yet.</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
