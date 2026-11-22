import Markdown from "react-markdown";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { ActorTag, Button, Card, Empty, Field, Flash, Input, PageHeader, Textarea, timeAgo } from "@/components/ui";
import { runJob, saveRecommendationForm } from "../actions";

export const metadata = { title: "Insights" };
export const maxDuration = 300;

export default async function Insights({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const rows = await getDb().select().from(schema.insights).orderBy(desc(schema.insights.createdAt)).limit(20);
  return (
    <div className="mx-auto max-w-3xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader
        title="Insights"
        subtitle="Recommendations from ChatGPT, Instinct and the weekly numbers. Agents read the latest ones before writing new messages."
        actions={
          <form action={runJob}>
            <input type="hidden" name="job" value="weekly" />
            <input type="hidden" name="back" value="/insights" />
            <Button>Write a review now</Button>
          </form>
        }
      />
      <details className="mb-6 rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-accent-600">+ Add your own note for the agents</summary>
        <form action={saveRecommendationForm} className="mt-3 space-y-2.5">
          <Field label="Title"><Input name="title" required placeholder="Stop pitching demos to seed-stage" /></Field>
          <Field label="What to do differently"><Textarea name="body" rows={4} required /></Field>
          <Button tone="primary">Save</Button>
        </form>
      </details>
      {rows.length ? (
        <div className="space-y-6">
          {rows.map((r) => (
            <Card key={r.id} title={r.title} actions={<span className="text-xs text-zinc-400"><ActorTag actor={r.createdBy} /> · {timeAgo(r.createdAt)}</span>}>
              <div className="prose-sm text-sm leading-relaxed text-zinc-800">
                <Markdown>{r.body}</Markdown>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty>No reviews yet. The first one is written next Monday, or press “Write a review now”.</Empty>
        </Card>
      )}
    </div>
  );
}
