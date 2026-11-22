/**
 * Who is doing something. People log in to the dashboard; agents use API keys.
 *
 * USERS     = "ishan:password,tanzil:password"
 * API_KEYS  = "chatgpt:<key>,claude:<key>,instinct:<key>"
 */

function parsePairs(raw: string | undefined): Array<[string, string]> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(":");
      return [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()] as [string, string];
    })
    .filter(([a, b]) => a && b);
}

export function users(): Array<[string, string]> {
  return parsePairs(process.env.USERS);
}

export function apiKeys(): Array<[string, string]> {
  return parsePairs(process.env.API_KEYS);
}

export function humanNames(): string[] {
  const names = users().map(([n]) => n);
  return names.length ? names : ["ishan", "tanzil"];
}

export function isHuman(actor: string): boolean {
  return humanNames().includes(actor.toLowerCase());
}

/** Default person for work that must be done by hand. */
export function defaultHuman(): string {
  return humanNames()[0];
}

/** Resolve an API key to an agent name, using a constant-time compare. */
export function actorForKey(key: string | null | undefined): string | null {
  if (!key) return null;
  for (const [name, k] of apiKeys()) {
    if (safeEqual(k, key)) return name;
  }
  return null;
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
