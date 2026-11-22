import Link from "next/link";
import { recentActivity } from "@/lib/services/activity";
import { canRevert } from "@/lib/services/revert";
import { ActorTag, Badge, Card, Flash, PageHeader, cx, dateTime } from "@/components/ui";
import { undo } from "../actions";

export const metadata = { title: "Activity" };

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; who?: string }> }) {
  const sp = await searchParams;
  let rows = await recentActivity(300);
  if (sp.who) rows = rows.filter((r) => r.actor === sp.who);
  const actors = Array.from(new Set((await recentActivity(1000)).map((r) => r.actor)));

  return (
    <div className="mx-auto max-w-5xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader title="Activity" subtitle="Every change by every person, agent and job. Undo anything." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/activity" className={cx("rounded-md px-2.5 py-1 text-xs font-medium", !sp.who ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700")}>Everyone</Link>
        {actors.map((a) => (
          <Link key={a} href={`/activity?who=${a}`} className={cx("rounded-md px-2.5 py-1 text-xs font-medium", sp.who === a ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700")}>{a}</Link>
        ))}
      </div>
      <Card padded={false}>
        <ul className="divide-y divide-zinc-100">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-32 shrink-0 text-xs text-zinc-400">{dateTime(a.createdAt)}</span>
              <span className="w-20 shrink-0"><ActorTag actor={a.actor} /></span>
              <Badge>{a.entityType}</Badge>
              <span className={cx("flex-1 text-zinc-700", a.revertedAt && "line-through opacity-50")}>
                {a.entityType === "lead" ? <Link href={`/leads/${a.entityId}`} className="hover:underline">{a.summary}</Link> : a.summary}
              </span>
              {canRevert(a) && (
                <form action={undo}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="back" value="/activity" />
                  <button className="text-xs font-medium text-zinc-500 hover:text-zinc-900">Undo</button>
                </form>
              )}
            </li>
          ))}
          {!rows.length && <li className="px-4 py-8 text-center text-sm text-zinc-500">Nothing yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
