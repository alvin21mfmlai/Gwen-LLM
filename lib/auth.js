import 'server-only';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { authSecret, users } from './config';

export const COOKIE = 'plc_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (payload) => createHmac('sha256', authSecret()).update(payload).digest('base64url');

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

/** Returns the matching user for a password, or null. Checks every user (constant-ish time). */
export function checkPassword(password) {
  let found = null;
  for (const u of users()) if (safeEqual(password, u.password) && !found) found = u;
  return found;
}

export function makeToken(user) {
  const payload = b64(JSON.stringify({ u: user.id, e: Date.now() + MAX_AGE * 1000 }));
  return `${payload}.${sign(payload)}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!u || Date.now() > e) return null;
    const user = users().find((x) => x.id === u);
    return user ? { id: user.id, name: user.name } : null;
  } catch {
    return null;
  }
}

export const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: MAX_AGE,
});

/** Current user from the session cookie (server components and route handlers). */
export async function currentUser() {
  const jar = await cookies();
  return readToken(jar.get(COOKIE)?.value);
}
