import Link from "next/link";
import { listLeads } from "@/lib/services/leads";
import { STAGES, STAGE_LABEL, TIERS, TIER_LABEL, SOURCES } from "@/lib/constants";
import { humanNames } from "@/lib/actors";
import { Badge, Card, ChannelBadge, Empty, Flash, Input, LinkButton, PageHeader, ScorePill, Select, StageBadge, TierBadge, timeAgo, cx } from "@/components/ui";

export const metadata = { title: "Leads" };

type SP = { q?: string; stage?: string; tier?: string; source?: string; owner?: string; sort?: string; page?: string; msg?: string; err?: string };

export default async function Leads({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const per = 50;
  const rows = await listLeads({
    q: sp.q,
    stage: sp.stage || undefined,
    tier: sp.tier || undefined,
    source: sp.source || undefined,
    owner: sp.owner || undefined,
    sort: (sp.sort as "score") || "recent",
    limit: per + 1,
    offset: (page - 1) * per,
  });
  const more = rows.length > per;
  const list = rows.slice(0, per);
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, msg: undefined, err: undefined, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/leads?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader title="Leads" subtitle="Everyone the engine, the agents and the team have found." actions={<LinkButton href="/leads/new" tone="accent">Add leads</LinkButton>} />

      <form className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-7">
        <Input name="q" defaultValue={sp.q} placeholder="Search name, company, email, LinkedIn…" className="col-span-2" />
        <Select name="stage" defaultValue={sp.stage ?? ""} options={[["", "All stages"], ...STAGES.map((s) => [s, STAGE_LABEL[s]] as const)]} />
        <Select name="tier" defaultValue={sp.tier ?? ""} options={[["", "All tiers"], ...TIERS.map((t) => [t, TIER_LABEL[t]] as const)]} />
        <Select name="source" defaultValue={sp.source ?? ""} options={[["", "All sources"], ...SOURCES.map((s) => [s, s] as const)]} />
        <Select name="owner" defaultValue={sp.owner ?? ""} options={[["", "Any owner"], ["ai", "Engine / Instinct"], ...humanNames().map((h) => [h, h] as const)]} />
        <div className="flex gap-2">
          <Select name="sort" defaultValue={sp.sort ?? "recent"} options={[["recent", "Newest"], ["score", "Best score"], ["touched", "Last touched"]]} />
          <button className="rounded-md bg-zinc-900 px-3 text-sm font-medium text-white">Go</button>
        </div>
      </form>

      <Card padded={false}>
        {list.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
                  <th className="w-10 px-4 py-2">Score</th>
                  <th className="px-2 py-2">Person</th>
                  <th className="px-2 py-2">Company</th>
                  <th className="px-2 py-2">Stage</th>
                  <th className="px-2 py-2">Why</th>
                  <th className="px-2 py-2">Channel</th>
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2 text-right">Last touch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {list.map(({ lead: l, company: c }) => (
                  <tr key={l.id} className={cx("hover:bg-zinc-50", l.paused && "opacity-60")}>
                    <td className="px-4 py-2"><ScorePill score={l.score} /></td>
                    <td className="px-2 py-2">
                      <Link href={`/leads/${l.id}`} className="font-medium text-zinc-900 hover:underline">{l.fullName}</Link>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span className="max-w-48 truncate">{l.title}</span>
                        <TierBadge tier={l.tier} />
                        {l.handsOff && <Badge tone="red">Hands-off</Badge>}
                        {l.paused && <Badge>Paused</Badge>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-zinc-700">{c?.name ?? <span className="text-zinc-400">—</span>}</td>
                    <td className="px-2 py-2"><StageBadge stage={l.stage} /></td>
                    <td className="max-w-xs px-2 py-2"><p className="line-clamp-2 text-xs text-zinc-600">{l.whyRelevant}</p></td>
                    <td className="px-2 py-2"><ChannelBadge channel={l.bestChannel} /></td>
                    <td className="px-2 py-2 text-xs text-zinc-500">{l.source}</td>
                    <td className="px-2 py-2 text-right text-xs text-zinc-500">{timeAgo(l.lastTouchAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            No leads match. <Link href="/leads/new" className="text-accent-600 underline">Add some</Link>, or ask ChatGPT, Claude or Instinct to find them.
          </Empty>
        )}
      </Card>
      {(page > 1 || more) && (
        <div className="mt-4 flex justify-between text-sm">
          {page > 1 ? <Link className="text-accent-600" href={qs({ page: String(page - 1) })}>← Previous</Link> : <span />}
          {more && <Link className="text-accent-600" href={qs({ page: String(page + 1) })}>Next →</Link>}
        </div>
      )}
    </div>
  );
}
