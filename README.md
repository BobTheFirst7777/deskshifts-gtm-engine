# Deskshift GTM Engine

One shared record of every lead, message and reply for Deskshift, with four ways in:

| Who | How they connect |
| --- | --- |
| ChatGPT, Claude | MCP server (`/api/mcp/<key>`), or REST + OpenAPI for Custom GPT Actions |
| Instinct | Agent console (`/agent/<key>`): plain pages with one job each, built for a browsing agent |
| Ishan, Tanzil | Dashboard: Today, Leads, lead timeline, Pipeline, Experiments, Insights, Events, Activity, Settings |
| The engine | Daily jobs: research and scoring, building the queue (with 3-day follow-ups), and the weekly review |

## The daily workflow

1. **8pm, find leads.** ChatGPT (your prompt, or a nightly run) and Instinct call `get_brief`, then add leads with `add_leads`. Duplicates merge. New leads start in **New**.
2. **Research.** Agents pick up `get_research_queue` (Instinct uses its **Research** page) and save each lead with `save_research`. That fills these columns:
   - how they relate to us
   - why now
   - what to pitch
   - importance (0–100)
   - best channel
   - signals with links
   - any extra columns they want
   - the drafts: a LinkedIn connection note under 300 characters, the first message, and an email subject
3. **Next step is queued.** For LinkedIn leads that's a **connection request**; once the connection is accepted, the **first message**. Email leads go straight to the message. Each step goes to **Review & send**.
4. **You approve** on Review & send: scroll, edit inline, then approve some or all. Approved sends become a **batch**, by default "Nov 22 · LinkedIn", or named by you.
5. **Instinct sends** only approved tasks (its **Send** page) and logs each one. It also logs accepted connections and replies. A reply stops follow-ups and creates a "Respond" task for you.
6. **Results.** The **Batches** page shows for each batch who was sent what, who accepted, who replied (with their reply) and who's silent. Agents read the same thing with `get_batch_results`.
7. **Recommendations.** Agents write what worked and what to change with `save_recommendations`. These show on **Insights**, and every agent reads the latest ones in `get_brief` before writing new drafts.

Other rules that always apply:
- **People win:** fields you edit are never overwritten by agents.
- **Hands-off leads** are yours alone; Instinct won't touch them.
- **Undo:** anything can be undone from Activity.
- **Pause:** one lead or everything.
- **Follow-ups:** a follow-up is queued 3 days after an unanswered *message*. Pending connection requests don't trigger them.

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
- **ChatGPT:** chatgpt.com/plugins → **+** → *Add custom MCP server* → paste `https://<app>/api/mcp/<chatgpt key>`, no authentication. In a chat, type **@** and pick it. Settings shows a ready-made nightly prompt.
- **Instinct:** text it `https://<app>/agent/<instinct key>` and say: *"This is your outreach console. Read the Rules page and follow it every day. Log everything you send and every reply there."*
  Then ask it to find leads, for example: *"Find 20 heads of customer success at Series A SaaS companies in SF and add them on the Add leads page."*

MCP tools:
- `get_brief`
- `get_research_queue`
- `save_research`
- `get_batch_results`
- `save_recommendations`
- `get_recommendations`
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
| GET | `/api/v1/brief` | What to do and what's waiting |
| GET / POST | `/api/v1/research` | Leads waiting for research; save research for one |
| GET | `/api/v1/batches` (`?name=`) | Batch results |
| GET / POST | `/api/v1/insights` | Read or write recommendations |
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
