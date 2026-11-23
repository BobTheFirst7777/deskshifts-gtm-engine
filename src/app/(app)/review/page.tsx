import Link from "next/link";
import { reviewQueue, defaultBatchName, listQueue, selfSendQueue } from "@/lib/services/actions";
import { requireUser } from "@/lib/auth";
import { humanNames } from "@/lib/actors";
import { getSettings } from "@/lib/services/settings";
import { ACTION_LABEL, CHANNEL_LABEL } from "@/lib/constants";
import { Badge, Button, Empty, Flash, Input, PageHeader, ScorePill, TierBadge, cx } from "@/components/ui";
import { runJob, sentByMe, skipReviewItem, submitReview } from "../actions";

export const metadata = { title: "Review & send" };

const TABS = [
  ["", "All"],
  ["linkedin", "LinkedIn"],
  ["email", "Email"],
] as const;

export default async function Review({ searchParams }: { searchParams: Promise<{ channel?: string; msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const channel = sp.channel || undefined;
  const user = await requireUser();
  const people = humanNames();
  const [items, all, approvedWaiting, settings, own, ownAll] = await Promise.all([
    reviewQueue({ channel }),
    reviewQueue(),
    listQueue({ assignee: "instinct", approvedOnly: true }),
    getSettings(),
    selfSendQueue(people, { channel }),
    selfSendQueue(people),
  ]);
  // Yours first, then teammates'.
  own.sort((a, b) => Number(b.action.assignee === user) - Number(a.action.assignee === user));
  const everything = [...all, ...ownAll];
  const count = (c: string) => (c ? everything.filter((r) => r.action.channel === c).length : everything.length);
  const back = `/review${channel ? `?channel=${channel}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader
        title="Review & send"
        subtitle={`Everything waiting to go out. Instinct sends only what you approve; for leads you handle yourself, send from your own LinkedIn or inbox and press “I sent it”.${approvedWaiting.length ? ` ${approvedWaiting.length} approved and waiting for Instinct.` : ""}`}
        actions={
          <form action={runJob}>
            <input type="hidden" name="job" value="queue" />
            <input type="hidden" name="back" value="/review" />
            <Button>Refill from researched leads</Button>
          </form>
        }
      />

      <div className="mb-4 flex items-center gap-1.5">
        {TABS.map(([c, label]) => (
          <Link
            key={c}
            href={c ? `/review?channel=${c}` : "/review"}
            className={cx("rounded-md px-2.5 py-1 text-xs font-medium", (channel ?? "") === c ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200")}
          >
            {label} <span className="tabular-nums opacity-70">{count(c)}</span>
          </Link>
        ))}
      </div>

      <h2 className="mb-2 mt-2 text-sm font-semibold text-zinc-900">Instinct sends, after you approve ({items.length})</h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-zinc-200">
          <Empty>
            Nothing waiting for review. New items appear here as soon as an agent saves research on a lead, when a LinkedIn connection is accepted, and when a follow-up is due.
            {settings.automationPaused && " (Automation is paused, so nothing new is being queued.)"}
          </Empty>
        </div>
      ) : (
        <form action={submitReview}>
          <input type="hidden" name="back" value={back} />
          <div className="sticky top-0 z-10 -mx-2 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2.5 backdrop-blur">
            <span className="text-sm font-medium">{items.length} waiting</span>
            <Input name="batch" placeholder={`Batch name (default: "${defaultBatchName(channel ?? items[0].action.channel)}")`} className="ml-auto h-8 max-w-72" />
            <Button name="mode" value="save" size="sm">Save edits</Button>
            <Button name="mode" value="selected" tone="primary" size="sm">Approve selected</Button>
            <Button name="mode" value="all" tone="accent" size="sm">Approve all {items.length}</Button>
          </div>

          <ul className="space-y-3">
            {items.map(({ action: a, lead: l, company: c }) => {
              const isConnect = a.type === "connect";
              const len = (a.draft ?? "").length;
              return (
                <li key={a.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                  <input type="hidden" name="item" value={a.id} />
                  <input type="hidden" name={`orig:${a.id}`} value={a.draft ?? ""} />
                  <div className="flex items-start gap-3">
                    <input type="checkbox" name="ids" value={a.id} className="mt-1 size-4 accent-zinc-900" aria-label={`Select ${l.fullName}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ScorePill score={l.score} />
                        <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.fullName}</Link>
                        <span className="text-sm text-zinc-500">{[l.title, c?.name].filter(Boolean).join(" · ")}</span>
                        <Badge tone={isConnect ? "blue" : a.type === "follow_up" ? "amber" : "indigo"}>{ACTION_LABEL[a.type]}</Badge>
                        <Badge>{CHANNEL_LABEL[a.channel ?? ""] ?? "Any"}</Badge>
                        <TierBadge tier={l.tier} />
                      </div>
                      {(l.pitchAngle || l.whyRelevant) && (
                        <p className="mt-1 text-xs text-zinc-600">
                          {l.pitchAngle && <><b className="font-medium text-zinc-800">Pitch:</b> {l.pitchAngle}. </>}
                          {l.whyRelevant && <><b className="font-medium text-zinc-800">Why now:</b> {l.whyRelevant}</>}
                        </p>
                      )}
                      {a.channel === "email" && (
                        <>
                          <input type="hidden" name={`origsubject:${a.id}`} value={a.subject ?? ""} />
                          <Input name={`subject:${a.id}`} defaultValue={a.subject ?? ""} placeholder="Subject" className="mt-2" />
                        </>
                      )}
                      <textarea
                        name={`draft:${a.id}`}
                        defaultValue={a.draft ?? ""}
                        rows={isConnect ? 3 : 5}
                        placeholder={isConnect ? "Connection note (optional, under 300 characters)" : "Write the message"}
                        className="mt-2 w-full rounded-md px-2.5 py-1.5 text-sm leading-relaxed ring-1 ring-inset ring-zinc-300 outline-none focus:ring-2 focus:ring-accent-500"
                      />
                      <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-400">
                        <span>
                          {isConnect ? `${len}/300 characters` : `${len} characters`}
                          {a.manualFields.includes("draft") && " · edited by you"}
                          {!a.draft && " · no draft yet: write one, or Instinct will write it from the research"}
                        </span>
                        <button formAction={skipReviewItem} name="skip" value={a.id} className="font-medium text-zinc-500 hover:text-red-600">
                          Skip this one
                        </button>
                      </div>
                      {isConnect && len > 300 && <p className="mt-1 text-xs text-red-600">LinkedIn notes are limited to 300 characters.</p>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </form>
      )}

      <h2 className="mb-2 mt-10 text-sm font-semibold text-zinc-900">You send ({own.length})</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Hands-off leads and tasks assigned to a person. The app can&apos;t send on LinkedIn for you: copy the note or message, send it from
        your own account, then press “I sent it” so it&apos;s on the timeline and in the batch.
      </p>
      {own.length === 0 ? (
        <div className="rounded-xl border border-zinc-200">
          <Empty>Nothing for you to send. Mark a lead “I&apos;ll handle this one” to send it yourself.</Empty>
        </div>
      ) : (
        <ul className="space-y-3">
          {own.map(({ action: a, lead: l, company: c }) => {
            const isConnect = a.type === "connect";
            return (
              <li key={a.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <form action={sentByMe}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="name" value={l.fullName} />
                  <input type="hidden" name="back" value={back} />
                  <div className="flex flex-wrap items-center gap-2">
                    <ScorePill score={l.score} />
                    <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.fullName}</Link>
                    <span className="text-sm text-zinc-500">{[l.title, c?.name].filter(Boolean).join(" · ")}</span>
                    <Badge tone={isConnect ? "blue" : a.type === "follow_up" ? "amber" : "indigo"}>{ACTION_LABEL[a.type]}</Badge>
                    <Badge>{CHANNEL_LABEL[a.channel ?? ""] ?? "Any"}</Badge>
                    {a.assignee !== user && <Badge tone="violet">for {a.assignee}</Badge>}
                    <span className="ml-auto flex gap-3 text-xs">
                      {l.linkedinUrl && <a href={l.linkedinUrl} target="_blank" className="text-accent-600 hover:underline">Open LinkedIn ↗</a>}
                      {l.email && a.channel === "email" && <a href={`mailto:${l.email}?subject=${encodeURIComponent(a.subject ?? "")}&body=${encodeURIComponent(a.draft ?? "")}`} className="text-accent-600 hover:underline">Open in mail ↗</a>}
                    </span>
                  </div>
                  {(l.pitchAngle || l.whyRelevant) && (
                    <p className="mt-1 text-xs text-zinc-600">
                      {l.pitchAngle && <><b className="font-medium text-zinc-800">Pitch:</b> {l.pitchAngle}. </>}
                      {l.whyRelevant && <><b className="font-medium text-zinc-800">Why now:</b> {l.whyRelevant}</>}
                    </p>
                  )}
                  {a.channel === "email" && <Input name="subject" defaultValue={a.subject ?? ""} placeholder="Subject" className="mt-2" />}
                  <textarea
                    name="content"
                    defaultValue={a.draft ?? ""}
                    rows={isConnect ? 3 : 5}
                    placeholder={isConnect ? "Connection note (optional, under 300 characters)" : "The message you sent"}
                    className="mt-2 w-full rounded-md px-2.5 py-1.5 text-sm leading-relaxed ring-1 ring-inset ring-zinc-300 outline-none focus:ring-2 focus:ring-accent-500"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input name="batch" placeholder={`Batch (default "${defaultBatchName(a.channel)}")`} className="h-8 max-w-64" />
                    <Button tone="primary" size="sm">{isConnect ? "I sent the request" : "I sent it"}</Button>
                    <button formAction={skipReviewItem} name="skip" value={a.id} className="ml-auto text-xs font-medium text-zinc-500 hover:text-red-600">
                      Skip this one
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">Edit the text to match exactly what you sent before pressing the button.</p>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
