import { getSettings } from "./settings";
import { latestInsights, listBatches } from "./batches";
import { researchQueue } from "./research";
import { reviewQueue } from "./actions";
import { overview } from "./stats";

/**
 * Everything an agent needs before starting work: what we sell, who to look for,
 * how many, what's waiting, and the latest recommendations to apply.
 */
export async function agentBrief() {
  const [s, insights, research, review, batches, ov] = await Promise.all([
    getSettings(),
    latestInsights(2),
    researchQueue(100),
    reviewQueue(),
    listBatches(5),
    overview(),
  ]);
  return {
    whatWeSell: s.pitch,
    whoWeSellTo: s.icp,
    howToFindLeads: s.sourcingBrief,
    leadsPerNight: s.nightlyLeadTarget,
    workflow: [
      "1. Find new leads that match who we sell to, following howToFindLeads. Add them with add_leads (duplicates merge automatically). Include LinkedIn URL, title, company website and why they fit.",
      "2. Research every lead in get_research_queue, then call save_research for each: how they relate to us, why now, what to pitch them on, importance 0-100, best channel, and the drafts (connection note under 300 characters for LinkedIn, first message, email subject if email). Add any extra columns you find useful in customFields.",
      "3. Nothing is sent until a person approves it on the Review & send page. Instinct sends approved tasks and logs each one with log_touchpoint.",
      "4. Log every accepted LinkedIn connection (kind connection_accepted) and every reply (direction in). Accepted connections automatically queue the first message for review.",
      "5. Use get_batch_results to see who replied in each batch, then save_recommendations with what worked, what didn't, and what to change.",
    ],
    latestRecommendations: insights.map((i) => ({ title: i.title, by: i.createdBy, at: i.createdAt, body: i.body.slice(0, 2500) })),
    waiting: {
      toResearch: research.length,
      toApprove: review.length,
    },
    recentBatches: batches.map((b) => ({ name: b.name, sent: b.sent, replied: b.replied, accepted: b.accepted, waitingToSend: b.waitingToSend })),
    totals: { leads: ov.total, replyRate30d: ov.replyRate30, meetings: ov.meetings },
  };
}
