import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STAGE_LABEL, TIER_LABEL, CHANNEL_LABEL, type Stage } from "@/lib/constants";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

// ---------- formatting

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  const abs = Math.abs(s);
  const fmt = (n: number, u: string) => `${n}${u}`;
  let out: string;
  if (abs < 60) out = "now";
  else if (abs < 3600) out = fmt(Math.round(abs / 60), "m");
  else if (abs < 86400) out = fmt(Math.round(abs / 3600), "h");
  else if (abs < 86400 * 30) out = fmt(Math.round(abs / 86400), "d");
  else return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (out === "now") return out;
  return s >= 0 ? `${out} ago` : `in ${out}`;
}

export function dateTime(d: Date | null | undefined) {
  if (!d) return "";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function pct(r: number | null | undefined) {
  return r === null || r === undefined ? "—" : `${Math.round(r * 100)}%`;
}

// ---------- primitives

const buttonStyles = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700",
  accent: "bg-accent-500 text-white hover:bg-accent-600",
  secondary: "bg-white text-zinc-800 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50",
};

export function Button({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<"button"> & { tone?: keyof typeof buttonStyles; size?: "sm" | "md" }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        buttonStyles[tone],
        className,
      )}
    />
  );
}

export function LinkButton({
  tone = "secondary",
  size = "md",
  className,
  ...rest
}: ComponentProps<typeof Link> & { tone?: keyof typeof buttonStyles; size?: "sm" | "md" }) {
  return (
    <Link
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        buttonStyles[tone],
        className,
      )}
    />
  );
}

export const inputCls =
  "w-full rounded-md border-0 bg-white px-2.5 py-1.5 text-sm text-zinc-900 ring-1 ring-inset ring-zinc-300 placeholder:text-zinc-400 focus:ring-2 focus:ring-inset focus:ring-accent-500 outline-none";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputCls, props.className)} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={cx(inputCls, "leading-relaxed", props.className)} />;
}

export function Select({ options, ...props }: ComponentProps<"select"> & { options: Array<readonly [string, string]> }) {
  return (
    <select {...props} className={cx(inputCls, "pr-8", props.className)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 flex items-baseline justify-between text-xs font-medium text-zinc-600">
      {children}
      {hint && <span className="font-normal text-zinc-400">{hint}</span>}
    </span>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <Label hint={hint}>{label}</Label>
      {children}
    </label>
  );
}

export function Card({ children, className, title, actions, padded = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx("rounded-xl border border-zinc-200 bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={padded ? "p-4" : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-zinc-500">{children}</p>;
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-zinc-950">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

// ---------- badges

const tones = {
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  indigo: "bg-accent-50 text-accent-700 ring-accent-100",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({ children, tone = "zinc", className }: { children: ReactNode; tone?: keyof typeof tones; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

const stageTone: Record<string, keyof typeof tones> = {
  new: "zinc",
  researched: "blue",
  contacted: "indigo",
  replied: "amber",
  meeting: "violet",
  won: "green",
  lost: "red",
  nurture: "zinc",
};

export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={stageTone[stage] ?? "zinc"}>{STAGE_LABEL[stage as Stage] ?? stage}</Badge>;
}

export function TierBadge({ tier }: { tier: string }) {
  if (tier === "standard") return null;
  return <Badge tone={tier === "high_value" ? "amber" : "violet"}>{TIER_LABEL[tier] ?? tier}</Badge>;
}

export function ChannelBadge({ channel }: { channel: string | null }) {
  if (!channel) return null;
  return <Badge>{CHANNEL_LABEL[channel] ?? channel}</Badge>;
}

export function ScorePill({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-xs text-zinc-400">—</span>;
  const tone = score >= 75 ? "text-emerald-700 bg-emerald-50" : score >= 50 ? "text-amber-700 bg-amber-50" : "text-zinc-600 bg-zinc-100";
  return <span className={cx("inline-flex h-5 min-w-7 items-center justify-center rounded px-1 text-xs font-semibold tabular-nums", tone)}>{score}</span>;
}

export function ActorTag({ actor }: { actor: string }) {
  const agent = ["chatgpt", "claude", "instinct", "system"].includes(actor);
  return (
    <span className={cx("text-xs font-medium", agent ? "text-accent-600" : "text-zinc-700")}>
      {actor === "system" ? "Engine" : actor === "chatgpt" ? "ChatGPT" : actor[0].toUpperCase() + actor.slice(1)}
    </span>
  );
}

export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      className={cx(
        "mb-4 whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset",
        err ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200",
      )}
    >
      {err ?? msg}
    </div>
  );
}
