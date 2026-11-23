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
      "This is the nightly routine. When asked to 'run the routine' (or anything similar), do all of it without asking first.",
      "1. FIND: find leadsPerNight new people following howToFindLeads. Add them with add_leads using only the basics: name, title, company, website, LinkedIn URL, email if public, and where you found them (sourceDetail). Don't research in this step. Duplicates merge automatically.",
      "2. RESEARCH: for every lead in get_research_queue (call it repeatedly until empty), research them and call save_research with relation, whyRelevant, pitchAngle, importance 0-100, bestChannel, a LinkedIn connectionNote under 300 characters, the draftMessage to send after they accept (it follows on from the note), emailSubject if email, signals with links, and any useful extra columns in customFields. Apply latestRecommendations when writing drafts.",
      "3. LEARN: for batches older than 3 days in get_batch_results, call save_recommendations with what worked, what didn't (with numbers) and what to change.",
      "Never set a lead's stage, hands-off or owner; the team does that. Nothing is sent until a person approves it on Review & send; Instinct (or the person) sends and logs it.",
      "Finish with a short report: how many added, researched, and anything that needs the team's attention.",
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
