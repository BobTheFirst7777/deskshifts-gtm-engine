import Link from "next/link";
import { getSettings } from "@/lib/services/settings";
import { instinctQueue, listQueue } from "@/lib/services/actions";
import { ACTION_LABEL, CHANNEL_LABEL } from "@/lib/constants";
import { actorForKey } from "@/lib/actors";
import { Flash, H1, shortId, Submit } from "../../ui";
import { markSent, skipTask } from "../actions";

export default async function Today({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const actor = actorForKey(key)!;
  const s = await getSettings();

  const { tasks, linkedinSentToday, waitingApproval } =
    actor === "instinct"
      ? await instinctQueue(s.instinctMode, s.linkedinDailyLimit)
      : { tasks: await listQueue({ assignee: actor }), linkedinSentToday: 0, waitingApproval: 0 };

  return (
    <main>
      <Flash msg={sp.msg} err={sp.err} />
      <H1>Today: {tasks.length} task{tasks.length === 1 ? "" : "s"}</H1>
      <p className="text-zinc-600">
        LinkedIn sent today: {linkedinSentToday} of {s.linkedinDailyLimit}.
        {waitingApproval > 0 && ` ${waitingApproval} more are waiting for the team to approve.`}
        {s.automationPaused && " Automation is paused by the team; only work tasks already listed."}
      </p>

      {tasks.length === 0 && <p className="mt-6 rounded border border-zinc-300 p-4">Nothing to do right now. Check for replies, then look for new leads.</p>}

      <ol className="mt-6 space-y-6">
        {tasks.map(({ action: a, lead: l, company: c }, i) => (
          <li key={a.id} id={shortId(a.id)} className="rounded border border-zinc-400 p-4">
            <p className="text-sm text-zinc-500">
              #{i + 1} · Task {shortId(a.id)} · {ACTION_LABEL[a.type] ?? a.type} · via <b>{CHANNEL_LABEL[a.channel ?? ""] ?? a.channel ?? "any"}</b>
            </p>
            <p className="mt-1 text-lg font-bold">
              {l.fullName}
              {l.title ? `, ${l.title}` : ""}
              {c ? ` at ${c.name}` : ""}
            </p>
            <ul className="mt-1 text-sm">
              {l.linkedinUrl && (
                <li>
                  LinkedIn: <a className="text-blue-700 underline" href={l.linkedinUrl}>{l.linkedinUrl}</a>
                </li>
              )}
              {l.email && <li>Email: {l.email}</li>}
              {l.phone && <li>Phone: {l.phone}</li>}
              {c?.domain && <li>Website: {c.domain}</li>}
            </ul>
            {(a.reason || l.whyRelevant) && <p className="mt-2"><b>Why:</b> {l.whyRelevant ?? a.reason}</p>}
            <p className="mt-1 text-sm">
              <Link className="text-blue-700 underline" href={`/agent/${key}/lead?id=${l.id}`}>Full history for {l.fullName}</Link>
            </p>

            <form action={markSent} className="mt-3">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="actionId" value={a.id} />
              <input type="hidden" name="leadId" value={l.id} />
              <input type="hidden" name="channel" value={a.channel ?? "linkedin"} />
              <input type="hidden" name="name" value={l.fullName} />
              <input type="hidden" name="kind" value={a.type === "connect" ? "connection_request" : "message"} />
              <label className="block font-medium">
                {a.draft ? "Message to send (edit it, then paste exactly what you sent):" : "No draft yet: write a short, specific message using the Why line and their history, then paste exactly what you sent:"}
                <textarea name="content" rows={5} defaultValue={a.draft ?? ""} className="mt-1 w-full rounded border border-zinc-400 px-2 py-1.5" />
              </label>
              <div className="mt-2"><Submit>Sent</Submit></div>
            </form>
            <form action={skipTask} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="actionId" value={a.id} />
              <input type="hidden" name="name" value={l.fullName} />
              <label className="flex-1">
                <span className="text-sm">Or skip, with a reason:</span>
                <input name="reason" placeholder="e.g. profile not found, already talking" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1.5" />
              </label>
              <Submit tone="secondary">Skip</Submit>
            </form>
          </li>
        ))}
      </ol>
    </main>
  );
}
