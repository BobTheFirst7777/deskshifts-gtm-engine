import type { LeadInput } from "@/lib/services/leads";

/** Small CSV/TSV parser: quoted fields, commas or tabs, CRLF. */
export function parseCsv(text: string): string[][] {
  const delim = text.split("\n")[0].includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

const ALIASES: Record<string, keyof LeadInput | "firstName" | "lastName"> = {
  name: "fullName",
  "full name": "fullName",
  fullname: "fullName",
  "first name": "firstName",
  firstname: "firstName",
  "last name": "lastName",
  lastname: "lastName",
  title: "title",
  "job title": "title",
  role: "title",
  company: "company",
  "company name": "company",
  organization: "company",
  domain: "companyDomain",
  website: "companyDomain",
  "company domain": "companyDomain",
  "company website": "companyDomain",
  linkedin: "linkedinUrl",
  "linkedin url": "linkedinUrl",
  "person linkedin url": "linkedinUrl",
  "linkedin profile": "linkedinUrl",
  email: "email",
  "email address": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  location: "location",
  city: "location",
  why: "whyRelevant",
  "why relevant": "whyRelevant",
  reason: "whyRelevant",
  notes: "notes",
  note: "notes",
  source: "sourceDetail",
  event: "event",
  employees: "companySize",
  "# employees": "companySize",
  "company size": "companySize",
  industry: "companyIndustry",
  funding: "companyFunding",
  segment: "segment",
};

/** Map a header row (Apollo, LinkedIn or Luma exports, or hand-made) to leads. */
export function rowsToLeads(rows: string[][]): LeadInput[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => ALIASES[h.toLowerCase().trim()] ?? null);
  if (!header.includes("fullName") && !header.includes("firstName")) return [];
  const out: LeadInput[] = [];
  for (const r of rows.slice(1)) {
    const o: Record<string, string> = {};
    header.forEach((k, i) => {
      if (k && r[i]) o[k] = r[i];
    });
    const fullName = o.fullName || [o.firstName, o.lastName].filter(Boolean).join(" ");
    if (!fullName) continue;
    delete o.firstName;
    delete o.lastName;
    out.push({ ...o, fullName } as LeadInput);
  }
  return out;
}
