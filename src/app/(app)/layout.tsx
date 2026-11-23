import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listQueue, reviewQueue, selfSendQueue } from "@/lib/services/actions";
import { getSettings } from "@/lib/services/settings";
import { Nav } from "@/components/nav";
import { logout, setAutomationPaused } from "./actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [mine, review, own, settings] = await Promise.all([listQueue({ assignee: user }), reviewQueue(), selfSendQueue([user]), getSettings()]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 px-3 py-4">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-7 place-items-center rounded-lg bg-zinc-900 text-sm font-bold text-white">D</span>
          <span className="text-sm font-semibold tracking-tight">Deskshift GTM</span>
        </Link>
        <Link
          href="/leads/new"
          className="mb-4 flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent-500 text-sm font-medium text-white hover:bg-accent-600"
        >
          <span className="text-base leading-none">+</span> Add leads
        </Link>
        <Nav counts={{ needsYou: mine.length, toReview: review.length + own.length }} />
        <div className="mt-auto space-y-3 px-1">
          <form action={setAutomationPaused} className="rounded-lg border border-zinc-200 bg-white p-2.5">
            <input type="hidden" name="paused" value={settings.automationPaused ? "false" : "true"} />
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <span className={`size-2 rounded-full ${settings.automationPaused ? "bg-amber-500" : "bg-emerald-500"}`} />
              Automation {settings.automationPaused ? "paused" : "running"}
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Instinct: {settings.instinctMode === "approve" ? "approve first" : "sends automatically"}
            </p>
            <button className="mt-2 w-full rounded-md bg-zinc-100 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200">
              {settings.automationPaused ? "Resume" : "Pause everything"}
            </button>
          </form>
          <form action={logout} className="flex items-center justify-between px-1 text-xs text-zinc-500">
            <span>
              Signed in as <b className="font-medium text-zinc-800">{user}</b>
            </span>
            <button className="hover:text-zinc-900">Log out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-7">{children}</main>
    </div>
  );
}
