import { createHmac } from "node:crypto";
import { safeEqual, users } from "./actors";

export const SESSION_COOKIE = "gtm_session";
const MAX_AGE_DAYS = 30;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(user: string) {
  const exp = Date.now() + MAX_AGE_DAYS * 86400_000;
  const payload = `${user}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the user name for a valid, unexpired session token. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  try {
    if (!safeEqual(sign(`${user}.${exp}`), sig)) return null;
  } catch {
    return null;
  }
  if (Number(exp) < Date.now()) return null;
  if (!users().some(([u]) => u === user)) return null;
  return user;
}

export function checkPassword(user: string, password: string): boolean {
  const u = user.trim().toLowerCase();
  const match = users().find(([n]) => n === u);
  return Boolean(match && safeEqual(match[1], password));
}

export const sessionMaxAge = MAX_AGE_DAYS * 86400;
