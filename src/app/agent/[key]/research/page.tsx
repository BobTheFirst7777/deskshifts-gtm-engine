import { researchQueue } from "@/lib/services/research";
import { getSettings } from "@/lib/services/settings";
import { CHANNELS, CHANNEL_LABEL } from "@/lib/constants";
import { Flash, H1, Submit } from "../../ui";
import { saveResearchAgent } from "../actions";

const box = "mt-1 w-full rounded border border-zinc-400 px-2 py-1.5";

export default async function Research({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { key } = await params;
  const sp = await searchParams;
  const rows = await researchQueue(15);
  const { draftWriter } = await getSettings();
  const writes = draftWriter === "any";
  return (
    <main>
      <Flash msg={sp.msg} err={sp.err} />
      <H1>Research: {rows.length} new lead{rows.length === 1 ? "" : "s"}</H1>
      <p className="text-zinc-600">
        For each lead: look at their LinkedIn, their company&apos;s site and recent news, then fill this in and save. Their first step
        (connection request or message) goes to the team for approval. Nothing is sent from here.
      </p>
      {rows.length === 0 && <p className="mt-6 rounded border border-zinc-300 p-4">Nothing waiting. Add new leads on Add leads.</p>}

      <ol className="mt-6 space-y-8">
        {rows.map(({ lead: l, company: c }, i) => (
          <li key={l.id} className="rounded border border-zinc-400 p-4">
            <p className="text-sm text-zinc-500">#{i + 1} · added by {l.source}{l.sourceDetail ? ` · ${l.sourceDetail}` : ""}</p>
            <p className="text-lg font-bold">
              {l.fullName}
              {l.title ? `, ${l.title}` : ""}
              {c ? ` at ${c.name}` : ""}
            </p>
            <ul className="text-sm">
              {l.linkedinUrl && <li>LinkedIn: <a className="text-blue-700 underline" href={l.linkedinUrl}>{l.linkedinUrl}</a></li>}
              {c?.domain && <li>Website: <a className="text-blue-700 underline" href={`https://${c.domain}`}>{c.domain}</a></li>}
              {l.email && <li>Email: {l.email}</li>}
              {(l.whyRelevant || l.notes) && <li>Notes so far: {l.whyRelevant ?? l.notes}</li>}
            </ul>

            <form action={saveResearchAgent} className="mt-3 space-y-3">
              <input type="hidden" name="key" value={key} />
              <input type="hidden" name="leadId" value={l.id} />
              <input type="hidden" name="name" value={l.fullName} />
              <label className="block font-medium">How they relate to Deskshift (their product, users, the problem Dex solves for them) *
                <textarea name="relation" required rows={3} className={box} />
              </label>
              <label className="block font-medium">Why reach out now (the trigger) *
                <textarea name="whyRelevant" required rows={2} className={box} />
              </label>
              <label className="block font-medium">What to pitch them on *
                <input name="pitchAngle" required className={box} placeholder="Dex as the in-app onboarding guide for new admins" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-medium">Importance 0-100 *
                  <input name="importance" type="number" min={0} max={100} required className={box} placeholder="80 = top priority" />
                </label>
                <label className="block font-medium">Best channel
                  <select name="bestChannel" defaultValue={l.linkedinUrl ? "linkedin" : "email"} className={box}>
                    {CHANNELS.map((ch) => <option key={ch} value={ch}>{CHANNEL_LABEL[ch]}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="linkedinConnected" /> We&apos;re already connected on LinkedIn
              </label>
              {writes ? (
                <>
              <label className="block font-medium">LinkedIn connection note (under 300 characters)
                <textarea name="connectionNote" rows={2} maxLength={300} className={box} />
              </label>
              <label className="block font-medium">First message (sent after they accept, or as the email)
                <textarea name="draftMessage" rows={5} className={box} />
              </label>
              <label className="block font-medium">Email subject (if email)
                <input name="emailSubject" className={box} />
              </label>
                </>
              ) : (
                <p className="rounded border border-zinc-300 bg-zinc-50 p-2 text-sm">Don&apos;t write messages: ChatGPT writes every note and message from your research.</p>
              )}
              <label className="block font-medium">Their email, if you found it
                <input name="email" defaultValue={l.email ?? ""} className={box} />
              </label>
              <label className="block font-medium">Signals, one per line, with a link
                <textarea name="signals" rows={3} className={box} placeholder="Raised $12M Series A https://techcrunch.com/…" />
              </label>
              <label className="block font-medium">Extra columns, one per line as Column: value
                <textarea name="customFields" rows={3} className={box} placeholder={"Support team size: 6\nUses Intercom: yes"} />
              </label>
              <Submit>Save research</Submit>
            </form>
          </li>
        ))}
      </ol>
    </main>
  );
}
