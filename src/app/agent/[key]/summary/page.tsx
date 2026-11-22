import { dailySummary } from "@/lib/services/summary";
import { H1 } from "../../ui";

export default async function Summary() {
  const s = await dailySummary();
  return (
    <main>
      <H1>Daily summary</H1>
      <p className="mb-3 text-zinc-600">Text this to the team as is.</p>
      <pre className="whitespace-pre-wrap rounded border border-zinc-400 bg-zinc-50 p-4 font-sans">{s.text}</pre>
    </main>
  );
}
