import Link from "next/link";
import { notFound } from "next/navigation";
import { getLeadDetail } from "@/lib/services/leads";
import { recentActivity } from "@/lib/services/activity";
import { canRevert } from "@/lib/services/revert";
import { aiEnabled } from "@/lib/ai";
import { humanNames } from "@/lib/actors";
import {
  ACTION_LABEL,
  ACTION_TYPES,
  CHANNELS,
  CHANNEL_LABEL,
  PRIORITIES,
  REPLY_LABELS,
  REPLY_LABEL_TEXT,
  SIGNAL_TYPES,
  STAGES,
  STAGE_LABEL,
  TIERS,
  TIER_LABEL,
} from "@/lib/constants";
import {
  ActorTag,
  Badge,
  Button,
  Card,
  ChannelBadge,
  Field,
  Flash,
  Input,
  ScorePill,
  Select,
  StageBadge,
  Textarea,
  TierBadge,
  dateTime,
  timeAgo,
  cx,
} from "@/components/ui";
import {
  addSignalForm,
  createTaskForm,
  deleteLeadAction,
  deleteTouchpointAction,
  logTouchpointForm,
  researchNow,
  restoreLeadAction,
  saveLead,
  saveTask,
  setLeadField,
  taskStatus,
  undo,
} from "../../actions";

export const maxDuration = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getLeadDetail(id);
  return { title: d?.lead.fullName ?? "Lead" };
}

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const d = await getLeadDetail(id);
  if (!d) notFound();
  const { lead: l, company: c, event: ev } = d;
  const activity = await recentActivity(20, id);
  const manual = (f: string) => (l.manualFields.includes(f) ? "set by hand" : undefined);
  const openTasks = d.actions.filter((a) => a.status === "pending");
  const doneTasks = d.actions.filter((a) => a.status !== "pending").slice(0, 6);
  const owners = [["ai", "Engine / Instinct"], ...humanNames().map((h) => [h, h])] as Array<[string, string]>;
  const self = `/leads/${id}`;

  return (
    <div className="mx-auto max-w-7xl">
      <Flash msg={sp.msg} err={sp.err} />
      {l.deletedAt && (
        <form action={restoreLeadAction} className="mb-4 flex items-center justify-between rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-800 ring-1 ring-red-200">
          <input type="hidden" name="id" value={id} />
          This lead is deleted. <Button size="sm">Restore</Button>
        </form>
      )}

      {/* ---------- header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/leads" className="text-xs text-zinc-500 hover:text-zinc-800">← Leads</Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{l.fullName}</h1>
            <ScorePill score={l.score} />
          </div>
          <p className="mt-0.5 text-sm text-zinc-600">
            {l.title}
            {l.title && c ? " at " : ""}
            {c && (c.domain ? <a className="font-medium hover:underline" href={`https://${c.domain}`} target="_blank">{c.name}</a> : <span className="font-medium">{c.name}</span>)}
            {l.location ? ` · ${l.location}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StageBadge stage={l.stage} />
            <TierBadge tier={l.tier} />
            {l.priority && <Badge tone={l.priority === "high" ? "amber" : "zinc"}>{l.priority} priority</Badge>}
            <ChannelBadge channel={l.bestChannel} />
            {l.segment && <Badge>{l.segment}</Badge>}
            {l.handsOff && <Badge tone="red">Hands-off</Badge>}
            {l.paused && <Badge>Paused</Badge>}
            <span className="text-xs text-zinc-500">
              via <ActorTag actor={l.source} />{l.sourceDetail ? ` · ${l.sourceDetail}` : ""}
              {ev && <> · <Link className="underline" href={`/events?id=${ev.id}`}>{ev.name}</Link></>}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {l.linkedinUrl && <a href={l.linkedinUrl} target="_blank" className="text-accent-600 hover:underline">LinkedIn ↗</a>}
            {l.email && <a href={`mailto:${l.email}`} className="text-accent-600 hover:underline">{l.email}</a>}
            {l.phone && <span className="text-zinc-700">{l.phone}</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action={setLeadField} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="field" value="stage" />
            <Select name="value" defaultValue={l.stage} options={STAGES.map((s) => [s, STAGE_LABEL[s]] as const)} className="h-9 w-36" />
            <Button>Move</Button>
          </form>
          <form action={setLeadField}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="field" value="handsOff" />
            <input type="hidden" name="value" value={l.handsOff ? "false" : "true"} />
            <Button title="Hands-off leads are worked by a person, never by Instinct">{l.handsOff ? "Let Instinct handle" : "I'll handle this one"}</Button>
          </form>
          <form action={setLeadField}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="field" value="paused" />
            <input type="hidden" name="value" value={l.paused ? "false" : "true"} />
            <Button>{l.paused ? "Resume" : "Pause"}</Button>
          </form>
          {aiEnabled() && (
            <form action={researchNow}>
              <input type="hidden" name="id" value={id} />
              <Button tone="accent">{l.researchedAt ? "Research again" : "Research now"}</Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- left: story */}
        <div className="space-y-6 lg:col-span-2">
          {(l.whyRelevant || d.signals.length > 0) && (
            <Card title="Why this lead">
              {l.whyRelevant && <p className="text-sm leading-relaxed text-zinc-800">{l.whyRelevant}</p>}
              {d.signals.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {d.signals.map((s) => (
                    <li key={s.id} className="flex gap-2 text-sm">
                      <Badge tone="blue">{s.type}</Badge>
                      <span className="text-zinc-700">
                        {s.summary}{" "}
                        {s.url && <a className="text-accent-600 hover:underline" href={s.url} target="_blank">source ↗</a>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Timeline">
            <form action={logTouchpointForm} className="mb-5 rounded-lg bg-zinc-50 p-3 ring-1 ring-inset ring-zinc-200">
              <input type="hidden" name="leadId" value={id} />
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Field label="What happened">
                  <Select
                    name="kindDir"
                    defaultValue="out:message"
                    options={[
                      ["out:message", "We sent a message"],
                      ["in:message", "They replied"],
                      ["out:connection_request", "Connection request"],
                      ["out:call", "Call"],
                      ["out:meeting", "Meeting"],
                      ["out:note", "Note"],
                    ]}
                  />
                </Field>
                <Field label="Channel">
                  <Select name="channel" defaultValue={l.bestChannel ?? "linkedin"} options={CHANNELS.map((ch) => [ch, CHANNEL_LABEL[ch]] as const)} />
                </Field>
                <Field label="Reply type" hint="if a reply">
                  <Select name="replyLabel" defaultValue="" options={[["", "—"], ...REPLY_LABELS.map((r) => [r, REPLY_LABEL_TEXT[r]] as const)]} />
                </Field>
                <Field label="When" hint="blank = now">
                  <Input type="datetime-local" name="occurredAt" />
                </Field>
              </div>
              <Textarea name="content" placeholder="Paste the message, the reply, or your notes" className="mt-2" />
              <div className="mt-2 flex justify-end"><Button tone="primary">Add to timeline</Button></div>
            </form>

            {d.touchpoints.length ? (
              <ol className="relative space-y-4 border-l border-zinc-200 pl-5">
                {d.touchpoints.map((t) => (
                  <li key={t.id} className="relative">
                    <span
                      className={cx(
                        "absolute -left-[27px] top-1 size-3 rounded-full ring-4 ring-white",
                        t.kind === "note" ? "bg-zinc-300" : t.direction === "in" ? "bg-amber-500" : "bg-accent-500",
                      )}
                    />
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                      <span className="font-medium text-zinc-800">
                        {t.kind === "note" ? "Note" : t.direction === "in" ? "They replied" : t.kind === "connection_request" ? "Connection request" : t.kind === "call" ? "Call" : t.kind === "meeting" ? "Meeting" : "We sent"}
                      </span>
                      <span>· {CHANNEL_LABEL[t.channel] ?? t.channel}</span>
                      {t.replyLabel && <Badge tone="amber">{REPLY_LABEL_TEXT[t.replyLabel]}</Badge>}
                      <span>· <ActorTag actor={t.createdBy} /></span>
                      <span title={t.occurredAt.toISOString()}>· {dateTime(t.occurredAt)}</span>
                      <form action={deleteTouchpointAction} className="ml-auto opacity-0 transition hover:opacity-100 [li:hover_&]:opacity-60">
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-xs text-zinc-400 hover:text-red-600" title="Remove (can be undone)">Remove</button>
                      </form>
                    </div>
                    {t.content && (
                      <p className={cx("mt-1 whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed", t.direction === "in" ? "bg-amber-50 text-zinc-900" : "bg-zinc-50 text-zinc-800")}>
                        {t.content}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-zinc-500">Nothing yet. When anyone sends or receives something, it shows up here.</p>
            )}
          </Card>

          <Card title="History of changes" padded={false}>
            <ul className="divide-y divide-zinc-100">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-zinc-400">{timeAgo(a.createdAt)}</span>
                  <ActorTag actor={a.actor} />
                  <span className={cx("flex-1 text-zinc-700", a.revertedAt && "line-through opacity-50")}>{a.summary}</span>
                  {canRevert(a) && (
                    <form action={undo}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="back" value={self} />
                      <button className="text-xs text-zinc-500 hover:text-zinc-900">Undo</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ---------- right: tasks + details */}
        <div className="space-y-6">
          <Card title={`Tasks (${openTasks.length} open)`} padded={false}>
            <ul className="divide-y divide-zinc-100">
              {openTasks.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={a.type === "respond" ? "amber" : "zinc"}>{ACTION_LABEL[a.type]}</Badge>
                    <ChannelBadge channel={a.channel} />
                    <span className="text-xs text-zinc-500">→ <ActorTag actor={a.assignee} /></span>
                    {a.assignee === "instinct" && <Badge tone={a.approvedAt ? "green" : "zinc"}>{a.approvedAt ? "approved" : "not approved"}</Badge>}
                  </div>
                  {a.reason && <p className="mt-1 text-xs text-zinc-500">{a.reason}</p>}
                  <form action={saveTask} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={a.id} />
                    <Textarea name="draft" defaultValue={a.draft ?? ""} rows={4} placeholder="Draft message" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Select name="assignee" defaultValue={a.assignee} options={[["instinct", "Instinct"], ...humanNames().map((h) => [h, h] as const)]} className="h-7 w-28 py-0 text-xs" />
                      <Button size="sm">Save</Button>
                      {a.assignee === "instinct" && !a.approvedAt && <Button size="sm" tone="accent" name="approve" value="1">Save + approve</Button>}
                    </div>
                  </form>
                  <div className="mt-2 flex gap-1.5">
                    <form action={taskStatus}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="done" />
                      <Button size="sm" tone="primary">Mark done</Button>
                    </form>
                    <form action={taskStatus}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="status" value="skipped" />
                      <Button size="sm" tone="ghost">Skip</Button>
                    </form>
                  </div>
                </li>
              ))}
              {doneTasks.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-500">
                  <span className="line-through">{ACTION_LABEL[a.type]}</span>
                  <span>{a.status}</span>
                  {a.completedBy && <span>by <ActorTag actor={a.completedBy} /></span>}
                  <span className="ml-auto">{timeAgo(a.completedAt)}</span>
                </li>
              ))}
            </ul>
            <details className="border-t border-zinc-100 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-accent-600">+ New task</summary>
              <form action={createTaskForm} className="mt-3 grid grid-cols-2 gap-2">
                <input type="hidden" name="leadId" value={id} />
                <Field label="Type"><Select name="type" defaultValue="custom" options={ACTION_TYPES.map((t) => [t, ACTION_LABEL[t]] as const)} /></Field>
                <Field label="For"><Select name="assignee" defaultValue={humanNames()[0]} options={[["instinct", "Instinct"], ...humanNames().map((h) => [h, h] as const)]} /></Field>
                <Field label="Channel"><Select name="channel" defaultValue={l.bestChannel ?? ""} options={[["", "—"], ...CHANNELS.map((ch) => [ch, CHANNEL_LABEL[ch]] as const)]} /></Field>
                <Field label="Due"><Input type="date" name="dueAt" /></Field>
                <Field label="What / draft" className="col-span-2"><Textarea name="draft" rows={2} /></Field>
                <div className="col-span-2"><Button size="sm" tone="primary">Add task</Button></div>
              </form>
            </details>
          </Card>

          <Card title="Details">
            <form action={saveLead} className="space-y-2.5">
              <input type="hidden" name="id" value={id} />
              {c && <input type="hidden" name="companyId" value={c.id} />}
              <Field label="Name" hint={manual("fullName")}><Input name="fullName" defaultValue={l.fullName} /></Field>
              <Field label="Title" hint={manual("title")}><Input name="title" defaultValue={l.title ?? ""} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email" hint={manual("email")}><Input name="email" defaultValue={l.email ?? ""} /></Field>
                <Field label="Phone" hint={manual("phone")}><Input name="phone" defaultValue={l.phone ?? ""} /></Field>
              </div>
              <Field label="LinkedIn" hint={manual("linkedinUrl")}><Input name="linkedinUrl" defaultValue={l.linkedinUrl ?? ""} /></Field>
              <Field label="Location" hint={manual("location")}><Input name="location" defaultValue={l.location ?? ""} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Tier" hint={manual("tier")}><Select name="tier" defaultValue={l.tier} options={TIERS.map((t) => [t, TIER_LABEL[t]] as const)} /></Field>
                <Field label="Score" hint={manual("score")}><Input name="score" type="number" min={0} max={100} defaultValue={l.score ?? ""} /></Field>
                <Field label="Priority" hint={manual("priority")}><Select name="priority" defaultValue={l.priority ?? ""} options={[["", "—"], ...PRIORITIES.map((p) => [p, p] as const)]} /></Field>
                <Field label="Best channel" hint={manual("bestChannel")}><Select name="bestChannel" defaultValue={l.bestChannel ?? ""} options={[["", "—"], ...CHANNELS.map((ch) => [ch, CHANNEL_LABEL[ch]] as const)]} /></Field>
                <Field label="Owner" hint={manual("owner")}><Select name="owner" defaultValue={l.owner} options={owners} /></Field>
                <Field label="Segment" hint={manual("segment")}><Input name="segment" defaultValue={l.segment ?? ""} /></Field>
              </div>
              <Field label="Why relevant" hint={manual("whyRelevant")}><Textarea name="whyRelevant" defaultValue={l.whyRelevant ?? ""} rows={3} /></Field>
              <Field label="First-message draft" hint={manual("draftMessage")}><Textarea name="draftMessage" defaultValue={l.draftMessage ?? ""} rows={3} /></Field>
              <Field label="Notes" hint={manual("notes")}><Textarea name="notes" defaultValue={l.notes ?? ""} rows={3} /></Field>
              <Field label="Tags" hint="comma separated"><Input name="tags" defaultValue={l.tags.join(", ")} /></Field>
              {c && (
                <div className="space-y-2.5 border-t border-zinc-100 pt-3">
                  <p className="text-xs font-semibold text-zinc-700">Company</p>
                  <Field label="Name"><Input name="companyName" defaultValue={c.name} /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Domain"><Input name="companyDomain" defaultValue={c.domain ?? ""} /></Field>
                    <Field label="Size"><Input name="companySize" defaultValue={c.size ?? ""} /></Field>
                    <Field label="Industry"><Input name="companyIndustry" defaultValue={c.industry ?? ""} /></Field>
                    <Field label="Funding"><Input name="companyFunding" defaultValue={c.fundingStage ?? ""} /></Field>
                  </div>
                  <Field label="About"><Textarea name="companyDescription" defaultValue={c.description ?? ""} rows={2} /></Field>
                </div>
              )}
              <p className="text-[11px] text-zinc-500">Fields you change are marked “set by hand” and the engine and agents will never overwrite them.</p>
              <Button tone="primary" className="w-full">Save changes</Button>
            </form>
          </Card>

          <Card title="Add a signal">
            <form action={addSignalForm} className="space-y-2">
              <input type="hidden" name="leadId" value={id} />
              <div className="grid grid-cols-3 gap-2">
                <Select name="type" defaultValue="post" options={SIGNAL_TYPES.map((t) => [t, t] as const)} />
                <Input name="summary" placeholder="Raised Series A" required className="col-span-2" />
              </div>
              <Input name="url" placeholder="Source link" />
              <Button size="sm">Add signal</Button>
            </form>
          </Card>

          <form action={deleteLeadAction} className="text-right">
            <input type="hidden" name="id" value={id} />
            <Button tone="danger" size="sm">Delete lead</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
