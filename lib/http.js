import 'server-only';
import { currentUser } from './auth';

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });

export const fail = (message, status = 400) => json({ error: message }, status);

/** Blocks cross-site requests that change data (defence in depth on top of SameSite cookies). */
function sameOrigin(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return true;
  const origin = request.headers.get('origin');
  if (!origin) return true; // same-origin fetches from older browsers / server tools
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Wraps a route handler: checks origin + session, passes `user` to the handler,
 * and turns thrown errors into JSON responses.
 */
export function withUser(handler) {
  return async (request, ctx) => {
    if (!sameOrigin(request)) return fail('Cross-site request blocked', 403);
    const user = await currentUser();
    if (!user) return fail('Please sign in again.', 401);
    try {
      return await handler(request, { ...ctx, user });
    } catch (e) {
      console.error(e);
      return fail(e?.publicMessage || e?.message || 'Something went wrong', e?.status || 500);
    }
  };
}

export async function readJSON(request) {
  try {
    return await request.json();
  } catch {
    const e = new Error('Invalid request body');
    e.status = 400;
    throw e;
  }
}
