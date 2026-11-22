import Link from "next/link";
import { getSettings } from "@/lib/services/settings";
import { H1, H2 } from "../ui";

export default async function AgentRules({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const s = await getSettings();
  const base = `/agent/${key}`;
  return (
    <main>
      <H1>Your job and your rules</H1>
      <p>
        You are Deskshift&apos;s outreach agent. Deskshift sells: {s.pitch}
      </p>
      <p className="mt-2">Ideal customers: {s.icp}</p>

      <H2>Every day</H2>
      <ol className="list-decimal space-y-1 pl-6">
        <li>
          Open <Link className="text-blue-700 underline" href={`${base}/today`}>Today</Link>. Work the tasks top to bottom.
          Before writing, open the lead&apos;s history from the task. Send the draft (improve it if you know something more
          specific), then press <b>Sent</b> with the exact text you sent.
        </li>
        <li>
          Check LinkedIn messages and email for replies. Log every reply on{" "}
          <Link className="text-blue-700 underline" href={`${base}/log`}>Log replies &amp; updates</Link>. A reply stops
          automatic follow-ups and alerts the team.
        </li>
        <li>
          When you find good prospects (LinkedIn, events on Luma, news, Apollo), add them on{" "}
          <Link className="text-blue-700 underline" href={`${base}/add`}>Add leads</Link>. Duplicates are merged
          automatically, so adding someone twice is safe.
        </li>
        <li>
          At the end of the day, read the <Link className="text-blue-700 underline" href={`${base}/summary`}>Daily summary</Link> and
          text it to the team.
        </li>
      </ol>

      <H2>Rules</H2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Only message people listed on your Today page. Never message a lead marked hands-off; the team handles those personally.</li>
        <li>
          {s.instinctMode === "approve"
            ? "Approve-first mode is on: your Today page only shows tasks a person has approved."
            : "Auto mode is on: you may send every task on your Today page."}
        </li>
        <li>LinkedIn pace: no more than {s.linkedinDailyLimit} connection requests or messages a day. Today stops showing LinkedIn tasks once you hit it.</li>
        <li>Log what actually happened, word for word. If you didn&apos;t send something, press Skip and say why.</li>
        <li>If someone asks to stop, log the reply as &quot;Unsubscribe&quot;. Never contact them again.</li>
        <li>If you&apos;re unsure, skip and explain; a person will pick it up.</li>
      </ul>

      <H2>Talking to the system in plain English</H2>
      <p>
        On the Log page you can also just write what happened, for example: <i>&quot;Sent connection request to Priya Shah
        (linkedin.com/in/priya-s) with note: …. Ben Ortiz replied on email: &apos;Sure, Thursday?&apos;&quot;</i>. It gets turned into
        records and you&apos;ll see exactly what was saved.
      </p>
    </main>
  );
}
