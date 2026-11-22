import { listVariants } from "@/lib/services/variants";
import { replyBreakdown, type BreakdownRow } from "@/lib/services/stats";
import { CHANNELS, CHANNEL_LABEL, TIER_LABEL } from "@/lib/constants";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, Select, Textarea, pct } from "@/components/ui";
import { createVariantForm, setVariantStatus } from "../actions";

export const metadata = { title: "Experiments" };

function Bars({ rows, label }: { rows: BreakdownRow[]; label?: (k: string | null, l: string | null) => string }) {
  if (!rows.length) return <Empty>No outbound logged yet.</Empty>;
  const max = Math.max(...rows.map((r) => r.rate ?? 0), 0.01);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={String(r.key)} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="truncate text-zinc-700">{label ? label(r.key, r.label) : (r.label ?? r.key ?? "Not set")}</span>
            <span className="tabular-nums text-zinc-500">
              <b className="font-semibold text-zinc-900">{pct(r.rate)}</b> · {r.replied}/{r.contacted}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-accent-500" style={{ width: `${((r.rate ?? 0) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function Experiments({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const [variants, byVariant, byChannel, bySegment, byTier, bySource] = await Promise.all([
    listVariants(),
    replyBreakdown("variant"),
    replyBreakdown("channel"),
    replyBreakdown("segment"),
    replyBreakdown("tier"),
    replyBreakdown("source"),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader
        title="Experiments"
        subtitle="Reply rates over the last 90 days. Each lead counts once, by its first message; a reply any time after counts."
      />

      <div className="mb-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <Card title="By channel"><Bars rows={byChannel} label={(k) => CHANNEL_LABEL[k ?? ""] ?? k ?? "Not set"} /></Card>
        <Card title="By tier"><Bars rows={byTier} label={(k) => TIER_LABEL[k ?? ""] ?? k ?? "Not set"} /></Card>
        <Card title="By segment"><Bars rows={bySegment} /></Card>
        <Card title="By source"><Bars rows={bySource} /></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Message versions" className="lg:col-span-2" padded={false}>
          {variants.length ? (
            <ul className="divide-y divide-zinc-100">
              {variants.map((v) => {
                const perf = byVariant.find((p) => p.key === v.id);
                return (
                  <li key={v.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{v.name}</span>
                      {v.channel && <Badge>{CHANNEL_LABEL[v.channel]}</Badge>}
                      {v.segment && <Badge tone="blue">{v.segment}</Badge>}
                      <Badge tone={v.status === "active" ? "green" : "zinc"}>{v.status}</Badge>
                      <span className="ml-auto text-sm tabular-nums">
                        <b>{pct(perf?.rate ?? null)}</b> <span className="text-zinc-500">· {perf?.replied ?? 0}/{perf?.contacted ?? 0}</span>
                      </span>
                    </div>
                    {v.angle && <p className="mt-1 text-xs text-zinc-500">Angle: {v.angle}</p>}
                    <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{v.body}</p>
                    <form action={setVariantStatus} className="mt-2 flex gap-1.5">
                      <input type="hidden" name="id" value={v.id} />
                      {v.status !== "active" && <Button size="sm" name="status" value="active">Activate</Button>}
                      {v.status === "active" && <Button size="sm" name="status" value="paused">Pause</Button>}
                      {v.status !== "retired" && <Button size="sm" tone="ghost" name="status" value="retired">Retire</Button>}
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No message versions yet. Add one, and research will base new drafts on the active versions so you can compare them.</Empty>
          )}
        </Card>

        <Card title="New message version">
          <form action={createVariantForm} className="space-y-2.5">
            <Field label="Name"><Input name="name" required placeholder="Support-load angle v1" /></Field>
            <Field label="Angle"><Input name="angle" placeholder="Their support tickets are growing faster than the team" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Segment"><Input name="segment" placeholder="Series A SaaS" /></Field>
              <Field label="Channel"><Select name="channel" defaultValue="" options={[["", "Any"], ...CHANNELS.map((c) => [c, CHANNEL_LABEL[c]] as const)]} /></Field>
            </div>
            <Field label="Message (a template, the engine personalises it)"><Textarea name="body" rows={6} required /></Field>
            <Button tone="primary">Add version</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
