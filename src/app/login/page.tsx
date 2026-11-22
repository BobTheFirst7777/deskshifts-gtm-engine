import { login } from "../(app)/actions";

export const metadata = { title: "Log in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; err?: string }> }) {
  const { next, err } = await searchParams;
  return (
    <div className="grid min-h-screen place-items-center bg-zinc-50 px-4">
      <form action={login} className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-zinc-900 font-bold text-white">D</span>
          <div>
            <p className="text-sm font-semibold">Deskshift GTM</p>
            <p className="text-xs text-zinc-500">Leads and outreach</p>
          </div>
        </div>
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Name</span>
          <input name="user" autoComplete="username" required className="w-full rounded-md px-3 py-2 text-sm ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-accent-500" />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-zinc-600">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className="w-full rounded-md px-3 py-2 text-sm ring-1 ring-zinc-300 outline-none focus:ring-2 focus:ring-accent-500" />
        </label>
        {err && <p className="mb-3 text-sm text-red-700">{err}</p>}
        <button className="h-9 w-full rounded-md bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-700">Log in</button>
      </form>
    </div>
  );
}
