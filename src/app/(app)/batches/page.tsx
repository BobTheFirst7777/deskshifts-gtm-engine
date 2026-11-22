import Link from "next/link";
import { batchDetail, listBatches } from "@/lib/services/batches";
import { CHANNEL_LABEL, REPLY_LABEL_TEXT } from "@/lib/constants";
import { Badge, Card, Empty, Kpi, PageHeader, StageBadge, cx, dateTime, pct } from "@/components/ui";

export const metadata = { title: "Batches" };

export default async function Batches({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  const sp = await searchParams;
  const batches = await listBatches(100);
  const name = sp.name ?? batches[0]?.name;
  const detail = name ? await batchDetail(name) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Batches" subtitle="Each day's approved sends, and what happened: who accepted, who replied, what they said, who's silent." />
      {!batches.length ? (
        <Card>
          <Empty>No batches yet. A batch is created when you approve messages on Review &amp; send.</Empty>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <Card title="All batches" padded={false} className="self-start">
            <ul className="divide-y divide-zinc-100">
              {batches.map((b) => (
                <li key={b.name}>
                  <Link
                    href={`/batches?name=${encodeURIComponent(b.name)}`}
                    className={cx("block px-4 py-2.5 hover:bg-zinc-50", b.name === name && "bg-zinc-50")}
                  >
                    <p className={cx("truncate text-sm", b.name === name && "font-medium")}>{b.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                      {b.sent} sent · {b.replied} replied{b.connectionRequests ? ` · ${b.accepted}/${b.connectionRequests} accepted` : ""}
                      {b.waitingToSend ? ` · ${b.waitingToSend} not sent yet` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {detail && (
            <div className="space-y-6 lg:col-span-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Kpi label="Sent" value={detail.summary.sent} sub={detail.summary.firstSentAt ? dateTime(detail.summary.firstSentAt) : "not sent yet"} />
                <Kpi label="Replied" value={detail.summary.replied} sub={pct(detail.summary.replyRate)} />
                <Kpi label="Silent" value={detail.summary.silent} />
                <Kpi
                  label="Accepted"
                  value={detail.summary.connectionRequests ? `${detail.summary.accepted}/${detail.summary.connectionRequests}` : "—"}
                  sub={detail.summary.connectionRequests ? pct(detail.summary.acceptRate) : "no connection requests"}
                />
                <Kpi label="Not sent yet" value={detail.summary.waitingToSend} />
              </div>

              <Card title={detail.summary.name} padded={false}>
                {detail.rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-left text-xs font-medium text-zinc-500">
                          <th className="px-4 py-2">Person</th>
                          <th className="px-2 py-2">Sent</th>
                          <th className="px-2 py-2">Accepted</th>
                          <th className="px-2 py-2">Reply</th>
                          <th className="px-2 py-2">Stage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 align-top">
                        {detail.rows.map((r) => (
                          <tr key={r.sent.id}>
                            <td className="px-4 py-2.5">
                              <Link href={`/leads/${r.lead.id}`} className="font-medium hover:underline">{r.lead.fullName}</Link>
                              <p className="text-xs text-zinc-500">{[r.lead.title, r.company?.name].filter(Boolean).join(" · ")}</p>
                            </td>
                            <td className="px-2 py-2.5 text-xs text-zinc-600">
                              {r.kind === "connection_request" ? "Connection request" : "Message"} · {CHANNEL_LABEL[r.sent.channel]}
                              <br />
                              {dateTime(r.sent.occurredAt)}
                              {r.sent.content && (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-accent-600">What we sent</summary>
                                  <p className="mt-1 max-w-sm whitespace-pre-wrap text-zinc-700">{r.sent.content}</p>
                                </details>
                              )}
                            </td>
                            <td className="px-2 py-2.5 text-xs">
                              {r.kind === "connection_request" ? (r.accepted ? <Badge tone="green">{dateTime(r.accepted.occurredAt)}</Badge> : <span className="text-zinc-400">not yet</span>) : <span className="text-zinc-300">—</span>}
                            </td>
                            <td className="max-w-md px-2 py-2.5">
                              {r.reply ? (
                                <>
                                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                                    {r.reply.replyLabel && <Badge tone="amber">{REPLY_LABEL_TEXT[r.reply.replyLabel]}</Badge>}
                                    {dateTime(r.reply.occurredAt)}
                                  </div>
                                  {r.reply.content && <p className="mt-1 line-clamp-3 text-sm text-zinc-800">“{r.reply.content}”</p>}
                                </>
                              ) : (
                                <span className="text-xs text-zinc-400">No reply · {r.daysWaiting}d</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5"><StageBadge stage={r.stage} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty>Approved but not sent yet.</Empty>
                )}
              </Card>

              {detail.waiting.length > 0 && (
                <Card title="Approved, not sent yet" padded={false}>
                  <ul className="divide-y divide-zinc-100">
                    {detail.waiting.map((w) => (
                      <li key={w.action.id} className="px-4 py-2 text-sm">
                        <Link href={`/leads/${w.lead.id}`} className="hover:underline">{w.lead.fullName}</Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
