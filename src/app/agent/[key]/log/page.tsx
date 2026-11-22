import { CHANNELS, CHANNEL_LABEL, REPLY_LABELS, REPLY_LABEL_TEXT } from "@/lib/constants";
import { aiEnabled } from "@/lib/ai";
import { Field, Flash, H1, H2, Submit } from "../../ui";
import { freeTextUpdate, logAccepted, logReply, saveRecommendationAgent } from "../actions";

export default async function Log({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  return (
    <main>
      <Flash msg={sp.msg} err={sp.err} />
      <H1>Log replies and updates</H1>

      <H2>A LinkedIn connection was accepted</H2>
      <form action={logAccepted} className="rounded border border-zinc-400 p-4">
        <input type="hidden" name="key" value={key} />
        <Field label="Who accepted (LinkedIn URL or full name)" name="lead" required placeholder="https://www.linkedin.com/in/…" />
        <Field label="Company (helps if you used a name)" name="company" />
        <Submit>Log accepted</Submit>
        <p className="mt-2 text-sm text-zinc-600">Their first message then goes to the team for approval. Don&apos;t message them until it shows on your Send page.</p>
      </form>

      <H2>A reply came in</H2>
      <form action={logReply} className="rounded border border-zinc-400 p-4">
        <input type="hidden" name="key" value={key} />
        <Field label="Who replied (LinkedIn URL, email, or full name)" name="lead" required placeholder="https://www.linkedin.com/in/…" />
        <Field label="Company (helps if you used a name)" name="company" />
        <label className="mb-3 block">
          <span className="font-medium">Channel</span>
          <select name="channel" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1.5" defaultValue="linkedin">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label className="mb-3 block">
          <span className="font-medium">What kind of reply</span>
          <select name="replyLabel" className="mt-1 w-full rounded border border-zinc-400 px-2 py-1.5" defaultValue="interested">
            {REPLY_LABELS.map((r) => (
              <option key={r} value={r}>{REPLY_LABEL_TEXT[r]}</option>
            ))}
          </select>
        </label>
        <Field label="Their reply, word for word" name="content" textarea />
        <Submit>Log reply</Submit>
      </form>

      <H2>Recommendations for the team</H2>
      <form action={saveRecommendationAgent} className="rounded border border-zinc-400 p-4">
        <input type="hidden" name="key" value={key} />
        <p className="mb-2 text-sm text-zinc-600">After a batch has had 3+ days: what worked, what didn&apos;t (with numbers), and what to change next.</p>
        <Field label="Title" name="title" required placeholder="Nov 22 LinkedIn batch: what worked" />
        <Field label="Batch name (optional)" name="batch" />
        <Field label="Recommendations" name="body" textarea required />
        <Submit>Save recommendations</Submit>
      </form>

      <H2>Or just write what happened</H2>
      {aiEnabled() ? (
        <form action={freeTextUpdate} className="rounded border border-zinc-400 p-4">
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="page" value="log" />
          <p className="mb-2 text-sm text-zinc-600">
            Several things at once is fine. Include LinkedIn URLs or task ids (like A-1a2b3c4d) when you have them.
          </p>
          <textarea
            name="text"
            rows={8}
            className="w-full rounded border border-zinc-400 px-2 py-1.5"
            placeholder={`Sent LinkedIn message to Priya Shah (linkedin.com/in/priya-s): "Hi Priya, …"\nBen Ortiz replied on email: "Sure, Thursday works?"\nMaya Chen's new title is VP Customer Success.`}
          />
          <div className="mt-2"><Submit>Save update</Submit></div>
        </form>
      ) : (
        <p className="rounded border border-zinc-300 p-4 text-zinc-600">Plain-English updates need an OpenAI key. Use the forms instead.</p>
      )}
    </main>
  );
}
