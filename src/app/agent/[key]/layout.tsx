import Link from "next/link";
import { notFound } from "next/navigation";
import { actorForKey } from "@/lib/actors";

export const dynamic = "force-dynamic";

export const metadata = { title: "Deskshift agent console", robots: { index: false } };

export default async function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const actor = actorForKey(key);
  if (!actor) notFound();
  const base = `/agent/${key}`;
  const links = [
    ["Rules", base],
    ["Today", `${base}/today`],
    ["Log replies & updates", `${base}/log`],
    ["Add leads", `${base}/add`],
    ["Look up a lead", `${base}/lead`],
    ["Daily summary", `${base}/summary`],
  ];
  return (
    <div className="agent mx-auto max-w-3xl px-5 py-6 text-[15px] leading-relaxed text-zinc-900">
      <header className="mb-6 border-b border-zinc-300 pb-3">
        <p className="text-sm text-zinc-500">Deskshift outreach engine · signed in as agent: <b>{actor}</b></p>
        <nav className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="font-medium text-blue-700 underline">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
