import { TIERS, TIER_LABEL } from "@/lib/constants";
import { Button, Card, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { bulkAddLeads, quickAddLead } from "../../actions";

export const metadata = { title: "Add leads" };

export default async function NewLead({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-5xl">
      <Flash msg={sp.msg} err={sp.err} />
      <PageHeader title="Add leads" subtitle="Adding someone already in the system is safe: details are merged, never duplicated." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="One lead" className="lg:col-span-3">
          <form action={quickAddLead} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="back" value="/leads/new" />
            <Field label="Full name *" className="col-span-2"><Input name="fullName" required /></Field>
            <Field label="Title"><Input name="title" /></Field>
            <Field label="Company"><Input name="company" /></Field>
            <Field label="Company website"><Input name="companyDomain" placeholder="acme.com" /></Field>
            <Field label="LinkedIn URL"><Input name="linkedinUrl" /></Field>
            <Field label="Email"><Input name="email" type="email" /></Field>
            <Field label="Phone"><Input name="phone" /></Field>
            <Field label="Location"><Input name="location" /></Field>
            <Field label="Tier">
              <Select name="tier" defaultValue="standard" options={TIERS.map((t) => [t, TIER_LABEL[t]] as const)} />
            </Field>
            <Field label="Why they matter" className="col-span-2"><Textarea name="whyRelevant" /></Field>
            <Field label="Where you found them"><Input name="sourceDetail" placeholder="Intro from Ember's CEO" /></Field>
            <Field label="Event"><Input name="event" placeholder="SaaStr dinner" /></Field>
            <Field label="Notes" className="col-span-2"><Textarea name="notes" rows={2} /></Field>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="handsOff" className="size-4 accent-zinc-900" />
              Hands-off: I&apos;ll reach out to this person myself (Instinct won&apos;t touch them)
            </label>
            <div className="col-span-2"><Button tone="primary">Add lead</Button></div>
          </form>
        </Card>

        <Card title="Paste many" className="lg:col-span-2">
          <form action={bulkAddLeads} className="space-y-3">
            <p className="text-xs text-zinc-500">
              Paste CSV or rows copied from a spreadsheet, with a header row. Apollo, LinkedIn and Luma exports work as is. Recognised columns: name (or first/last name), title, company, website, linkedin, email, phone, location, why, notes, event.
            </p>
            <Textarea name="csv" rows={12} className="font-mono text-xs" placeholder={"name,title,company,linkedin,why\nPriya Shah,Head of CS,Acme,linkedin.com/in/priya-s,Hiring 3 support reps"} />
            <Field label="Where these came from (optional)"><Input name="sourceDetail" placeholder="Apollo: SF SaaS, 50-200 employees" /></Field>
            <Button tone="primary">Import</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
