# Deskshift GTM Engine

One shared record of every lead, message and reply for Deskshift, with four ways in:

| Who | How they connect |
| --- | --- |
| ChatGPT, Claude | MCP server (`/api/mcp/<key>`), or REST + OpenAPI for Custom GPT Actions |
| Instinct | Agent console (`/agent/<key>`): plain pages with one job each, built for a browsing agent |
| Ishan, Tanzil | Dashboard: Today, Leads, lead timeline, Pipeline, Experiments, Insights, Events, Activity, Settings |
| The engine | Daily jobs: research and scoring, building the queue (with 3-day follow-ups), and the weekly review |

## How it behaves

- **Anyone can add leads.** ChatGPT, Claude, Instinct and people add leads the same way. A lead that already exists (same LinkedIn, email, or name at the same company) is merged: empty fields are filled and nothing is duplicated. Each lead records who added it.
- **People always win.** Any field a person edits is marked *set by hand*. Agents and jobs never overwrite it; the API reports those fields as `skipped`.
- **Everything can be done by hand.** Add, edit, log a message or reply, create or finish tasks, move stages, pause a lead, or pause everything. Manual updates trigger the same follow-on actions as agent updates: logging a reply by hand cancels follow-ups, just as it does when Instinct logs it.
- **Undo anything.** Every change is in Activity with who made it, and most can be undone in one click. Deletes are soft.
- **Hands-off leads** are worked by a person, never by Instinct.
- **Approve-first mode** (default): Instinct only sees tasks you approve on Today. Switch to auto in Settings.
- **The loop:**
  1. Research scores new leads and drafts a first message.
  2. The queue picks the best 30 a day.
  3. Instinct sends and logs each message.
  4. If there's no reply in 3 days, the queue adds a follow-up with a new angle.
  5. A reply stops follow-ups and creates a "Respond" task for you.
  6. The weekly review compares reply rates by message version, channel, segment and tier, and research uses the latest review when it writes new drafts.

## Deploy on Vercel (about 10 minutes)

1. Push this folder to a new GitHub repo, then import it in Vercel (**Add New → Project**).
2. In the project, open **Storage → Marketplace → Neon (Postgres)** and connect it. This sets `DATABASE_URL`.
3. Under **Settings → Environment Variables**, add the rest from `.env.example`:
   - `AUTH_SECRET`
   - `USERS`
   - `API_KEYS`
   - `CRON_SECRET`
   - `OPENAI_API_KEY`
   - `APP_URL` (optional)
4. Deploy. The build applies database migrations automatically. The cron jobs in `vercel.json` run daily:
   - research at 2am PT
   - queue at 5am PT
   - weekly review on Mondays

   On the Hobby plan, crons are limited to once a day, which is all this needs.
5. Log in with a name and password from `USERS`.

## Connect the agents

Open **Settings** in the dashboard. It shows the exact URLs with your keys.

- **Claude:** Settings → Connectors → *Add custom connector* → paste `https://<app>/api/mcp/<claude key>`.
- **ChatGPT:** Settings → Apps & Connectors → enable developer mode → *Create* → paste `https://<app>/api/mcp/<chatgpt key>`.
  Or, in a Custom GPT, go to *Actions → Import from URL* → `https://<app>/api/openapi.json`, then set auth to API key, Bearer, and your ChatGPT key.
- **Instinct:** text it `https://<app>/agent/<instinct key>` and say: *"This is your outreach console. Read the Rules page and follow it every day. Log everything you send and every reply there."*
  Then ask it to find leads, for example: *"Find 20 heads of customer success at Series A SaaS companies in SF and add them on the Add leads page."*

MCP tools:
- `search`
- `list_leads`
- `get_lead`
- `add_leads`
- `update_lead`
- `add_signals`
- `log_touchpoint`
- `get_today_queue`
- `update_task`
- `create_task`
- `daily_summary`
- `get_stats`
- `message_versions`
- `run_job`

## REST API

Send `Authorization: Bearer <key>` (or `x-api-key`, or `?key=`).

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/v1/search?q=decagon` | Matching people and companies with full history |
| GET / POST | `/api/v1/leads` | List with filters, or add one lead, an array, or `{ leads: [...] }` |
| GET / PATCH / DELETE | `/api/v1/leads/:id` | Full record; update fields; soft delete |
| POST | `/api/v1/leads/:id/signals` | Add signals |
| POST | `/api/v1/touchpoints` | Log a send, reply, call, meeting or note (`leadId` or `lead: { linkedinUrl \| email \| name }`) |
| GET / POST | `/api/v1/actions` | Today's queue (`?assignee=instinct`); create a task |
| PATCH | `/api/v1/actions/:id` | `{ status: "done" \| "skipped" \| "pending" }`, or edit a draft |
| GET | `/api/v1/summary` | Daily status (`?format=text`) |
| GET | `/api/v1/stats` | Reply rates by channel, version, segment, tier and source |
| GET / POST | `/api/v1/variants` | Message versions |
| POST | `/api/v1/jobs/research` \| `queue` \| `weekly` | Run a job now |

## Run locally

```bash
cp .env.example .env.local   # set DATABASE_URL=pglite:./.data/pglite for a zero-setup database
npm install
npm run dev                  # migrates, then starts on http://localhost:3000
npm test                     # engine tests on an in-memory Postgres
```

## Layout

- `src/lib/services/`: the engine
  - leads and dedupe
  - touchpoints and stage logic
  - actions and the queue
  - undo
  - stats
  - weekly review
- `src/lib/ai.ts`: research with web search, drafting, parsing plain-English agent updates, the weekly write-up
- `src/lib/mcp.ts`: MCP tools
- `src/app/api/`: REST, MCP, cron
- `src/app/agent/`: Instinct's console
- `src/app/(app)/`: dashboard
- `drizzle/`: SQL migrations (`npm run db:generate` after changing `src/lib/db/schema.ts`)

## Not built yet

- Inbound email address for logging (Instinct and the APIs cover this for now).
- Two-way sync with Google Sheets.
