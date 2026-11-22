import Link from "next/link";
import { listEvents, listLeads } from "@/lib/services/leads";
import { Badge, Button, Card, Empty, Field, Flash, Input, PageHeader, ScorePill, StageBadge, cx } from "@/components/ui";
import { addEventForm } from "../actions";

export const metadata = { title: "Events" };

export default async function Events({ searchParams }: { searchParams: Promise<{ id?: string; msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const events = await listEvents();
  const selected = events.find((e) => e.id === sp.id) ?? events[0];
  const attendees = selected ? await listLeads({ eventId: selected.id, sort: "score", limit: 300 }) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader title="Events" subtitle="Luma events and meetups: who's going, ranked by fit, so you know who to talk to." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card title="Events" padded={false}>
            {events.length ? (
              <ul className="divide-y divide-zinc-100">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events?id=${e.id}`} className={cx("flex items-center justify-between px-4 py-2.5 text-sm hover:bg-zinc-50", selected?.id === e.id && "bg-zinc-50 font-medium")}>
                      <span className="truncate">{e.name}</span>
                      <span className="text-xs tabular-nums text-zinc-500">{e.leadCount}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No events yet.</Empty>
            )}
          </Card>
          <Card title="Add an event">
            <form action={addEventForm} className="space-y-2.5">
              <Field label="Name"><Input name="name" required placeholder="SaaS Founders Mixer" /></Field>
              <Field label="Link"><Input name="url" placeholder="https://lu.ma/…" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Date"><Input name="date" type="date" /></Field>
                <Field label="Location"><Input name="location" /></Field>
              </div>
              <Button tone="primary">Add event</Button>
              <p className="text-xs text-zinc-500">Then ask an agent: “add everyone on this Luma page as leads with event = [name], and rank them”. Or paste the guest list on Add leads with an event column.</p>
            </form>
          </Card>
        </div>

        <Card
          className="lg:col-span-2"
          title={selected ? selected.name : "Attendees"}
          actions={selected?.url && <a href={selected.url} target="_blank" className="text-xs text-accent-600 hover:underline">Event page ↗</a>}
          padded={false}
        >
          {attendees.length ? (
            <ul className="divide-y divide-zinc-100">
              {attendees.map(({ lead: l, company: c }) => (
                <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                  <ScorePill score={l.score} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/leads/${l.id}`} className="text-sm font-medium hover:underline">{l.fullName}</Link>
                      <span className="truncate text-xs text-zinc-500">{[l.title, c?.name].filter(Boolean).join(" · ")}</span>
                    </div>
                    {l.whyRelevant && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600">{l.whyRelevant}</p>}
                  </div>
                  <StageBadge stage={l.stage} />
                  {l.handsOff && <Badge tone="red">Hands-off</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No attendees linked yet.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
