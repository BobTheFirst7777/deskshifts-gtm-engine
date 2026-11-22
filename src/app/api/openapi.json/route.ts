import { NextResponse } from "next/server";
import { CHANNELS, REPLY_LABELS, STAGES, TIERS } from "@/lib/constants";

/**
 * OpenAPI spec so a Custom GPT (ChatGPT "Actions") can use the engine.
 * In the GPT editor: Actions → Import from URL → <your-app>/api/openapi.json,
 * Authentication → API key → Bearer → your chatgpt key.
 */
export async function GET(req: Request) {
  const origin = process.env.APP_URL || new URL(req.url).origin;
  const str = { type: "string" };
  const leadProps = {
    fullName: str,
    title: str,
    email: str,
    phone: str,
    linkedinUrl: str,
    location: str,
    company: { type: "string", description: "Company name" },
    companyDomain: str,
    companySize: str,
    companyIndustry: str,
    companyFunding: str,
    companyDescription: str,
    sourceDetail: { type: "string", description: "Where you found them, e.g. 'Apollo: SF SaaS 50-200'" },
    event: { type: "string", description: "Event name if found via an event (e.g. Luma)" },
    eventUrl: str,
    tier: { type: "string", enum: TIERS },
    score: { type: "integer", minimum: 0, maximum: 100 },
    whyRelevant: { type: "string", description: "Why this lead matters for Deskshift" },
    bestChannel: { type: "string", enum: CHANNELS },
    segment: str,
    notes: str,
    signals: {
      type: "array",
      items: { type: "object", properties: { type: str, summary: str, url: str }, required: ["summary"] },
    },
  };
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Deskshift GTM Engine",
      version: "1.0.0",
      description:
        "Deskshift's lead and outreach system. Add leads you find, look up full history before writing, and log every message sent or reply received.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: {
        Lead: { type: "object", properties: leadProps, required: ["fullName"] },
      },
    },
    security: [{ bearer: [] }],
    paths: {
      "/api/v1/search": {
        get: {
          operationId: "searchEverything",
          summary: "Find people or companies and get their full history (signals, messages, replies, tasks)",
          parameters: [{ name: "q", in: "query", required: true, schema: str }],
          responses: { "200": { description: "Matches with full history" } },
        },
      },
      "/api/v1/leads": {
        get: {
          operationId: "listLeads",
          summary: "List leads with filters",
          parameters: [
            { name: "q", in: "query", schema: str },
            { name: "stage", in: "query", schema: { type: "string", enum: STAGES } },
            { name: "tier", in: "query", schema: { type: "string", enum: TIERS } },
            { name: "sort", in: "query", schema: { type: "string", enum: ["recent", "score", "touched"] } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Leads" } },
        },
        post: {
          operationId: "addLeads",
          summary: "Add one or more leads. Duplicates (same LinkedIn, email, or name at the same company) are merged automatically.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { leads: { type: "array", items: { $ref: "#/components/schemas/Lead" } } },
                  required: ["leads"],
                },
              },
            },
          },
          responses: { "200": { description: "What was added, merged or failed" } },
        },
      },
      "/api/v1/leads/{id}": {
        get: {
          operationId: "getLead",
          summary: "Full lead record with timeline",
          parameters: [{ name: "id", in: "path", required: true, schema: str }],
          responses: { "200": { description: "Lead" } },
        },
        patch: {
          operationId: "updateLead",
          summary: "Update lead fields. Fields the team set by hand are protected and come back in 'skipped'.",
          parameters: [{ name: "id", in: "path", required: true, schema: str }],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    stage: { type: "string", enum: STAGES },
                    tier: { type: "string", enum: TIERS },
                    score: { type: "integer" },
                    whyRelevant: str,
                    bestChannel: { type: "string", enum: CHANNELS },
                    title: str,
                    email: str,
                    phone: str,
                    notes: str,
                    segment: str,
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Updated lead" } },
        },
      },
      "/api/v1/touchpoints": {
        post: {
          operationId: "logTouchpoint",
          summary: "Log a message sent (direction out), a reply received (direction in), a call, meeting or note",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    leadId: str,
                    lead: {
                      type: "object",
                      description: "Use instead of leadId",
                      properties: { linkedinUrl: str, email: str, name: str, company: str },
                    },
                    channel: { type: "string", enum: CHANNELS },
                    direction: { type: "string", enum: ["out", "in"] },
                    kind: { type: "string", enum: ["message", "connection_request", "call", "meeting", "note"] },
                    content: str,
                    replyLabel: { type: "string", enum: REPLY_LABELS },
                    actionId: str,
                  },
                  required: ["channel", "direction"],
                },
              },
            },
          },
          responses: { "200": { description: "Logged" } },
        },
      },
      "/api/v1/actions": {
        get: {
          operationId: "getTodayQueue",
          summary: "Today's outreach tasks, highest priority first",
          parameters: [{ name: "assignee", in: "query", schema: str }],
          responses: { "200": { description: "Tasks" } },
        },
      },
      "/api/v1/actions/{id}": {
        patch: {
          operationId: "updateTask",
          summary: "Mark a task done/skipped, or edit its draft",
          parameters: [{ name: "id", in: "path", required: true, schema: str }],
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "object", properties: { status: { type: "string", enum: ["done", "skipped", "pending"] }, note: str, draft: str } },
              },
            },
          },
          responses: { "200": { description: "Task" } },
        },
      },
      "/api/v1/summary": {
        get: { operationId: "dailySummary", summary: "Status of the last 24 hours and today", responses: { "200": { description: "Summary" } } },
      },
      "/api/v1/stats": {
        get: { operationId: "stats", summary: "Reply rates by channel, message version, segment and tier", responses: { "200": { description: "Stats" } } },
      },
    },
  };
  return NextResponse.json(spec);
}
