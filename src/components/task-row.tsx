import Link from "next/link";
import type { Action, Company, Lead } from "@/lib/db/schema";
import { ACTION_LABEL } from "@/lib/constants";
import { Badge, Button, ChannelBadge, ScorePill, TierBadge, Textarea, timeAgo, cx } from "./ui";
import { approveTask, saveTask, taskStatus } from "@/app/(app)/actions";

export function TaskRow({
  action: a,
  lead: l,
  company: c,
  showApproval,
  back = "/",
}: {
  action: Action;
  lead: Lead;
  company?: Company | null;
  showApproval?: boolean;
  back?: string;
}) {
  const overdue = a.dueAt.getTime() < Date.now() - 86400_000;
  return (
    <li className="group px-4 py-3">
      <div className="flex items-start gap-3">
        <ScorePill score={l.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/leads/${l.id}`} className="text-sm font-medium text-zinc-900 hover:underline">
              {l.fullName}
            </Link>
            {c && <span className="text-sm text-zinc-500">{c.name}</span>}
            <Badge tone={a.type === "respond" ? "amber" : "zinc"}>{ACTION_LABEL[a.type] ?? a.type}</Badge>
            <ChannelBadge channel={a.channel} />
            <TierBadge tier={l.tier} />
            {l.handsOff && <Badge tone="red">Hands-off</Badge>}
            {showApproval && a.approvedAt && <Badge tone="green">Approved</Badge>}
            {overdue && <Badge tone="red">Due {timeAgo(a.dueAt)}</Badge>}
          </div>
          {(a.reason || l.whyRelevant) && <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{a.reason ?? l.whyRelevant}</p>}
          {a.draft && (
            <details className="mt-1.5">
              <summary className="cursor-pointer select-none text-xs font-medium text-accent-600">
                Draft{a.manualFields.includes("draft") ? " (edited)" : ""}: <span className="font-normal text-zinc-500">{a.draft.slice(0, 80)}…</span>
              </summary>
              <form action={saveTask} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={a.id} />
                <Textarea name="draft" defaultValue={a.draft} rows={5} />
                <div className="flex gap-2">
                  <Button size="sm" tone="primary">Save draft</Button>
                  {showApproval && !a.approvedAt && (
                    <Button size="sm" tone="accent" name="approve" value="1">Save and approve</Button>
                  )}
                </div>
              </form>
            </details>
          )}
        </div>
        <div className={cx("flex shrink-0 items-center gap-1.5")}>
          {showApproval ? (
            <form action={approveTask}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="approve" value={a.approvedAt ? "0" : "1"} />
              <Button size="sm" tone={a.approvedAt ? "ghost" : "accent"}>{a.approvedAt ? "Unapprove" : "Approve"}</Button>
            </form>
          ) : (
            <form action={taskStatus}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value="done" />
              <input type="hidden" name="back" value={back} />
              <Button size="sm" tone="primary">Done</Button>
            </form>
          )}
          <form action={taskStatus}>
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="status" value="skipped" />
            <Button size="sm" tone="ghost">Skip</Button>
          </form>
        </div>
      </div>
    </li>
  );
}
