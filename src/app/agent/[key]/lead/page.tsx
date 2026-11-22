import Link from "next/link";
import { getLeadDetail, listLeads } from "@/lib/services/leads";
import { ACTION_LABEL, CHANNEL_LABEL, REPLY_LABEL_TEXT, STAGE_LABEL, type Stage } from "@/lib/constants";
import { H1, H2, shortId } from "../../ui";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "");

export default async function LeadLookup({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ q?: string; id?: string }>;
}) {
  const { key } = await params;
  const { q, id } = await searchParams;

  if (id) {
    const d = await getLeadDetail(id);
    if (!d) return <p>Lead not found.</p>;
    const { lead: l, company: c } = d;
    return (
      <main>
        <H1>
          {l.fullName}
          {c ? ` · ${c.name}` : ""}
        </H1>
        <ul className="text-sm">
          <li>Stage: <b>{STAGE_LABEL[l.stage as Stage]}</b> · Tier: {l.tier} · Score: {l.score ?? "–"}</li>
          {l.title && <li>Title: {l.title}</li>}
          {l.linkedinUrl && <li>LinkedIn: <a className="text-blue-700 underline" href={l.linkedinUrl}>{l.linkedinUrl}</a></li>}
          {l.email && <li>Email: {l.email}</li>}
          {l.handsOff && <li className="font-bold text-red-700">Hands-off: the team handles this person. Do not message them.</li>}
        </ul>
        {l.whyRelevant && <p className="mt-2"><b>Why:</b> {l.whyRelevant}</p>}
        {c?.description && <p className="mt-1"><b>Company:</b> {c.description}</p>}

        <H2>Signals</H2>
        {d.signals.length ? (
          <ul className="list-disc pl-6">
            {d.signals.map((s) => (
              <li key={s.id}>
                {s.summary} {s.url && <a className="text-blue-700 underline" href={s.url}>source</a>}
              </li>
            ))}
          </ul>
        ) : (
          <p>None yet.</p>
        )}

        <H2>Conversation, oldest first</H2>
        {d.touchpoints.length ? (
          <ol className="space-y-2">
            {[...d.touchpoints].reverse().map((t) => (
              <li key={t.id} className="rounded border border-zinc-300 p-2">
                <p className="text-sm text-zinc-500">
                  {day(t.occurredAt)} · {t.kind === "note" ? "Note" : t.direction === "out" ? "We sent" : "They replied"} · {CHANNEL_LABEL[t.channel] ?? t.channel}
                  {t.replyLabel ? ` · ${REPLY_LABEL_TEXT[t.replyLabel]}` : ""} · by {t.createdBy}
                </p>
                {t.content && <p className="whitespace-pre-wrap">{t.content}</p>}
              </li>
            ))}
          </ol>
        ) : (
          <p>No messages yet.</p>
        )}

        <H2>Open tasks</H2>
        <ul className="list-disc pl-6">
          {d.actions.filter((a) => a.status === "pending").map((a) => (
            <li key={a.id}>
              {shortId(a.id)} · {ACTION_LABEL[a.type]} · {a.assignee}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const rows = q ? await listLeads({ q, limit: 20 }) : [];
  return (
    <main>
      <H1>Look up a lead</H1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Name, company, domain, email or LinkedIn" className="flex-1 rounded border border-zinc-400 px-2 py-1.5" />
        <button className="rounded bg-blue-700 px-4 py-2 font-semibold text-white">Search</button>
      </form>
      {q && (
        <ul className="mt-4 space-y-1">
          {rows.length === 0 && <li>No matches.</li>}
          {rows.map((r) => (
            <li key={r.lead.id}>
              <Link className="text-blue-700 underline" href={`/agent/${key}/lead?id=${r.lead.id}`}>
                {r.lead.fullName}
                {r.company ? ` · ${r.company.name}` : ""}
              </Link>{" "}
              <span className="text-sm text-zinc-500">({STAGE_LABEL[r.lead.stage as Stage]})</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
