import Link from "next/link";
import { listLeads } from "@/lib/services/leads";
import { STAGES, STAGE_LABEL } from "@/lib/constants";
import { Badge, PageHeader, ScorePill, Select, TierBadge, timeAgo } from "@/components/ui";
import { setLeadField } from "../actions";

export const metadata = { title: "Pipeline" };

export default async function Pipeline() {
  const rows = await listLeads({ limit: 500, sort: "score" });
  const byStage = new Map<string, typeof rows>();
  for (const s of STAGES) byStage.set(s, []);
  for (const r of rows) byStage.get(r.lead.stage)?.push(r);

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Every lead by stage. Move a card by picking its new stage." />
      <div className="-mx-8 overflow-x-auto px-8 pb-4">
        <div className="flex min-w-max gap-3">
          {STAGES.map((s) => {
            const list = byStage.get(s)!;
            return (
              <section key={s} className="flex w-64 shrink-0 flex-col rounded-xl bg-zinc-100/70 p-2">
                <header className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <Link href={`/leads?stage=${s}`} className="text-xs font-semibold uppercase tracking-wide text-zinc-600 hover:text-zinc-900">{STAGE_LABEL[s]}</Link>
                  <span className="text-xs tabular-nums text-zinc-500">{list.length}</span>
                </header>
                <ul className="space-y-2">
                  {list.slice(0, 60).map(({ lead: l, company: c }) => (
                    <li key={l.id} className="rounded-lg border border-zinc-200 bg-white p-2.5 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/leads/${l.id}`} className="text-sm font-medium leading-tight hover:underline">{l.fullName}</Link>
                        <ScorePill score={l.score} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">{[l.title, c?.name].filter(Boolean).join(" · ")}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <TierBadge tier={l.tier} />
                        {l.handsOff && <Badge tone="red">Hands-off</Badge>}
                        <span className="ml-auto text-[11px] text-zinc-400">{timeAgo(l.lastTouchAt ?? l.createdAt)}</span>
                      </div>
                      <form action={setLeadField} className="mt-2 flex gap-1">
                        <input type="hidden" name="id" value={l.id} />
                        <input type="hidden" name="field" value="stage" />
                        <Select name="value" defaultValue={l.stage} options={STAGES.map((x) => [x, STAGE_LABEL[x]] as const)} className="h-7 py-0 text-xs" />
                        <button className="h-7 rounded-md bg-zinc-100 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-200">Move</button>
                      </form>
                    </li>
                  ))}
                  {list.length > 60 && (
                    <li className="px-1.5 text-xs text-zinc-500">
                      <Link href={`/leads?stage=${s}`} className="underline">+{list.length - 60} more</Link>
                    </li>
                  )}
                  {!list.length && <li className="px-1.5 py-4 text-center text-xs text-zinc-400">Empty</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
