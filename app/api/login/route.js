import { cookies } from 'next/headers';
import { checkPassword, makeToken, cookieOptions, COOKIE } from '@/lib/auth';
import { users } from '@/lib/config';
import { hit } from '@/lib/store';
import { json, fail } from '@/lib/http';

export async function POST(request) {
  if (!users().length) return fail('No password is set up yet. Add APP_PASSWORD in the Vercel environment variables.', 503);

  const ip = (request.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  try {
    const attempts = await hit(`rl:login:${ip}`, 600);
    if (attempts > 10) return fail('Too many attempts. Please wait ten minutes and try again.', 429);
  } catch (e) {
    console.warn('rate limit unavailable:', e.message);
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const user = checkPassword(String(body.password || ''));
  if (!user) {
    await new Promise((r) => setTimeout(r, 600));
    return fail('That password is not right.', 401);
  }
  const jar = await cookies();
  jar.set(COOKIE, makeToken(user), cookieOptions());
  return json({ ok: true });
}
