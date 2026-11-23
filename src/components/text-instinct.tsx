import { getSettings } from "@/lib/services/settings";
import { timeAgo } from "./ui";

export const SEND_NOW_TEXT = "I just approved new messages. Open your Send page now, send them all, and log each one.";

/** Link that opens Messages / WhatsApp with the "send now" text ready to go. */
export function instinctLink(contact: string, via: "imessage" | "whatsapp", text = SEND_NOW_TEXT) {
  const c = contact.trim();
  if (!c) return null;
  if (via === "whatsapp") return `https://wa.me/${c.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
  // "?&body=" works for Messages on iPhone/Mac and for Android.
  return `sms:${c.replace(/[^\d+@.a-zA-Z]/g, "")}?&body=${encodeURIComponent(text)}`;
}

export async function TextInstinct({ waiting, compact }: { waiting: number; compact?: boolean }) {
  const s = await getSettings();
  const href = instinctLink(s.instinctContact, s.instinctContactVia);
  const last = s.instinctLastCheckedAt ? new Date(s.instinctLastCheckedAt) : null;
  const stale = !last || Date.now() - last.getTime() > 2 * 3600_000;
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5 text-sm ${waiting > 0 ? "border-amber-200 bg-amber-50" : "border-zinc-200 bg-white"}`}>
      <span className="text-zinc-700">
        <b className="font-medium text-zinc-900">{waiting}</b> approved, waiting for Instinct.{" "}
        <span className={stale ? "text-amber-800" : "text-zinc-500"}>
          Instinct last checked its Send page {last ? timeAgo(last) : "never"}.
        </span>
      </span>
      {waiting > 0 &&
        (href ? (
          <a href={href} className="ml-auto inline-flex h-8 items-center rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700">
            Text Instinct to send now
          </a>
        ) : (
          !compact && (
            <a href="/settings#instinct" className="ml-auto text-xs font-medium text-accent-600 hover:underline">
              Add Instinct&apos;s number for a one-tap “send now” →
            </a>
          )
        ))}
    </div>
  );
}
