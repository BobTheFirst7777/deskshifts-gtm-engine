import { api } from "@/lib/api";
import { overview, replyBreakdown } from "@/lib/services/stats";

export const GET = api(async () => ({
  overview: await overview(),
  byChannel: await replyBreakdown("channel"),
  byVariant: await replyBreakdown("variant"),
  bySegment: await replyBreakdown("segment"),
  byTier: await replyBreakdown("tier"),
  bySource: await replyBreakdown("source"),
}));
