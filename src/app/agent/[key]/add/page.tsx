import { aiEnabled } from "@/lib/ai";
import { Field, Flash, H1, H2, Submit } from "../../ui";
import { addLeadForm, freeTextUpdate } from "../actions";

export default async function Add({
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
      <H1>Add a lead</H1>
      <p className="text-zinc-600">Adding someone who is already here is safe: the details are merged, never duplicated.</p>

      <form action={addLeadForm} className="mt-4 rounded border border-zinc-400 p-4">
        <input type="hidden" name="key" value={key} />
        <Field label="Full name" name="fullName" required />
        <Field label="Title" name="title" placeholder="Head of Customer Success" />
        <Field label="Company" name="company" />
        <Field label="Company website" name="companyDomain" placeholder="acme.com" />
        <Field label="LinkedIn URL" name="linkedinUrl" placeholder="https://www.linkedin.com/in/…" />
        <Field label="Email" name="email" />
        <Field label="Phone" name="phone" />
        <Field label="Location" name="location" />
        <Field label="Why they matter for Deskshift" name="whyRelevant" textarea placeholder="Posted about onboarding drop-off last week; Series A in October" />
        <Field label="Where you found them" name="sourceDetail" placeholder="LinkedIn search: SaaS heads of CS, SF" />
        <Field label="Event (if found via an event)" name="event" placeholder="SaaStr Annual dinner (Luma)" />
        <Field label="A signal you saw" name="signal" placeholder="Hiring 3 support reps" />
        <Field label="Link to that signal" name="signalUrl" />
        <Submit>Add lead</Submit>
      </form>

      {aiEnabled() && (
        <>
          <H2>Add many at once</H2>
          <form action={freeTextUpdate} className="rounded border border-zinc-400 p-4">
            <input type="hidden" name="key" value={key} />
            <input type="hidden" name="page" value="add" />
            <p className="mb-2 text-sm text-zinc-600">One person per line, with whatever you know: name, title, company, LinkedIn, why.</p>
            <textarea
              name="text"
              rows={8}
              className="w-full rounded border border-zinc-400 px-2 py-1.5"
              placeholder={`Add lead: Maya Chen, CEO at Loopwise (loopwise.ai), linkedin.com/in/mayachen — posted about onboarding drop-off\nAdd lead: Raj Patel, Head of Support at Tallyfy, linkedin.com/in/rajp — attending the SaaS Ops Luma meetup`}
            />
            <div className="mt-2"><Submit>Add all</Submit></div>
          </form>
        </>
      )}
    </main>
  );
}
