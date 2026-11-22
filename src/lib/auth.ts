import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "./session";
import { actorForKey } from "./actors";

export async function currentUser(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<string> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/** Who is calling the API: an agent with a key, or a logged-in person. */
export function actorFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const key = bearer || req.headers.get("x-api-key") || new URL(req.url).searchParams.get("key");
  const agent = actorForKey(key);
  if (agent) return agent;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(m ? decodeURIComponent(m[1]) : null);
}
