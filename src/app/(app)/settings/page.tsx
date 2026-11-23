import { headers } from "next/headers";
import { getSettings } from "@/lib/services/settings";
import { apiKeys } from "@/lib/actors";
import { aiEnabled } from "@/lib/ai";
import { Badge, Button, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { runJob, saveSettings } from "../actions";

export const metadata = { title: "Settings" };
export const maxDuration = 300;

function Copy({ value }: { value: string }) {
  return <code className="block overflow-x-auto whitespace-nowrap rounded-md bg-zinc-100 px-2.5 py-1.5 font-mono text-xs text-zinc-800">{value}</code>;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const h = await headers();
  const origin = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const keys = apiKeys();

  return (
    <div className="mx-auto max-w-5xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader title="Settings" subtitle="How the engine behaves, and how ChatGPT, Claude and Instinct connect to it." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Engine">
          <form action={saveSettings} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sends per day" hint="up for review at once"><Input name="dailyTarget" type="number" min={0} defaultValue={s.dailyTarget} /></Field>
              <Field label="Follow up after (days)"><Input name="followUpDays" type="number" min={1} defaultValue={s.followUpDays} /></Field>
              <Field label="Max follow-ups" hint="then nurture"><Input name="maxFollowUps" type="number" min={0} defaultValue={s.maxFollowUps} /></Field>
              <Field label="LinkedIn sends per day"><Input name="linkedinDailyLimit" type="number" min={0} defaultValue={s.linkedinDailyLimit} /></Field>
              <Field label="Give up on a connection after (days)" hint="then email, or nurture"><Input name="connectionGiveUpDays" type="number" min={1} defaultValue={s.connectionGiveUpDays} /></Field>
            </div>
            <Field label="Instinct mode">
              <Select
                name="instinctMode"
                defaultValue={s.instinctMode}
                options={[
                  ["approve", "Approve first: Instinct only sends what you approve"],
                  ["auto", "Auto: Instinct sends everything assigned to it"],
                ]}
              />
            </Field>
            <Field label="Who we sell to" hint="every agent reads this"><Textarea name="icp" defaultValue={s.icp} rows={5} /></Field>
            <Field label="How to find leads" hint="the nightly lead-finding brief"><Textarea name="sourcingBrief" defaultValue={s.sourcingBrief} rows={6} /></Field>
            <Field label="New leads per night"><Input name="nightlyLeadTarget" type="number" min={0} defaultValue={s.nightlyLeadTarget} /></Field>
            <Field label="What we sell" hint="used in every draft"><Textarea name="pitch" defaultValue={s.pitch} rows={4} /></Field>
            <Button tone="primary">Save</Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Run now">
            <p className="mb-3 text-sm text-zinc-600">
              These run on their own every day (research 2am PT, queue 5am PT, review Mondays). Run them now when you want.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                ["research", "Research new leads"],
                ["queue", "Build today's queue"],
                ["weekly", "Write weekly review"],
              ].map(([job, label]) => (
                <form key={job} action={runJob}>
                  <input type="hidden" name="job" value={job} />
                  <input type="hidden" name="back" value="/settings" />
                  <Button disabled={job === "research" && !aiEnabled()}>{label}</Button>
                </form>
              ))}
            </div>
            {!aiEnabled() && <p className="mt-2 text-xs text-amber-700">Research needs OPENAI_API_KEY.</p>}
          </Card>

          <Card title="Connect your agents">
            {keys.length === 0 && <p className="text-sm text-amber-700">No API keys set. Add API_KEYS in Vercel (see README).</p>}
            <div className="space-y-5">
              {keys.map(([name, key]) => (
                <div key={name}>
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                    {name === "chatgpt" ? "ChatGPT" : name[0].toUpperCase() + name.slice(1)} <Badge>key: {key.slice(0, 4)}…</Badge>
                  </p>
                  {name === "instinct" ? (
                    <div className="space-y-1.5 text-xs text-zinc-600">
                      <p>Text Instinct this link and say: “This is your outreach console. Read the Rules page and follow it every day.”</p>
                      <Copy value={`${origin}/agent/${key}`} />
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs text-zinc-600">
                      <p>
                        Connector URL.{" "}
                        {name === "chatgpt"
                          ? "ChatGPT: chatgpt.com/plugins → + → Add custom MCP server → paste this, no authentication."
                          : "Claude: Settings → Connectors → Add custom connector → paste this."}
                      </p>
                      <Copy value={`${origin}/api/mcp/${key}`} />
                      <p className="pt-1">
                        Day to day, just say <b>“@Deskshift GTM run the routine”</b>. The full routine is built in. To change it for one run, paste this
                        and edit it:
                      </p>
                      <pre className="whitespace-pre-wrap rounded-md bg-zinc-100 px-2.5 py-1.5 font-sans text-xs text-zinc-800">{`Using Deskshift GTM, call get_brief first. Then:
1) Find ${s.nightlyLeadTarget} new leads following "howToFindLeads". Add them with add_leads: just the basics (name, title, company, website, LinkedIn URL, email if public, where you found them). Don't research them in this step.
2) For every lead in get_research_queue, research it and call save_research with: relation, whyRelevant, pitchAngle, importance (0-100), bestChannel, a LinkedIn connectionNote under 300 characters, the draftMessage to send after they accept (it should follow on from the note), emailSubject if email, and signals with links.
3) For batches older than 3 days in get_batch_results, call save_recommendations with what worked and what to change.
Don't set stages or hands-off; the team does that. Then tell me what you added and anything that needs my attention.`}</pre>
                    </div>
                  )}
                </div>
              ))}
              <div className="border-t border-zinc-100 pt-4 text-xs text-zinc-600">
                <p className="mb-1.5 font-medium text-zinc-800">REST API</p>
                <p>Any key works as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code> on <code className="font-mono">{origin}/api/v1/…</code>. Spec at /api/openapi.json.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
