import { api, HttpError } from "@/lib/api";
import { JOBS, type JobName } from "@/lib/jobs";

export const maxDuration = 300;

/** POST /api/v1/jobs/research | queue | weekly — run a job now. */
export const POST = api<{ job: string }>(async (_req, _actor, { job }) => {
  if (!(job in JOBS)) throw new HttpError(404, "Unknown job. Use research, queue or weekly.");
  return JOBS[job as JobName]();
});
