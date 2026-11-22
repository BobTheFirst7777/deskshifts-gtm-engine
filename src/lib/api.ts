import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { actorFromRequest } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };

/** Wraps an API route: checks the key, returns JSON, turns errors into clear messages. */
export function api<P = Record<string, string>>(
  fn: (req: Request, actor: string, params: P) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    const actor = actorFromRequest(req);
    if (!actor) {
      return NextResponse.json(
        { error: "Unauthorized. Send your key as 'Authorization: Bearer <key>', an 'x-api-key' header, or ?key=." },
        { status: 401 },
      );
    }
    try {
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, actor, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid input", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const status = (e as { status?: number })?.status;
  if (status && status >= 400 && status < 600) {
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
  console.error(e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export function query(req: Request) {
  return Object.fromEntries(new URL(req.url).searchParams.entries());
}
