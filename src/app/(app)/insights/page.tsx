import Markdown from "react-markdown";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { Button, Card, Empty, Flash, PageHeader, timeAgo } from "@/components/ui";
import { runJob } from "../actions";

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
        subtitle="Weekly review of what's working: written every Monday, and fed back into research and drafts."
        actions={
          <form action={runJob}>
            <input type="hidden" name="job" value="weekly" />
            <input type="hidden" name="back" value="/insights" />
            <Button>Write a review now</Button>
          </form>
        }
      />
      {rows.length ? (
        <div className="space-y-6">
          {rows.map((r) => (
            <Card key={r.id} title={r.title} actions={<span className="text-xs text-zinc-400">{timeAgo(r.createdAt)}</span>}>
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
