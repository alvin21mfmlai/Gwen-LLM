import 'server-only';

/** Parses a Server-Sent Events response body into { event, data } objects. */
export async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      let event = 'message';
      const data = [];
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (!data.length) continue;
      const text = data.join('\n');
      if (text === '[DONE]') return;
      try {
        yield { event, data: JSON.parse(text) };
      } catch {
        /* ignore keep-alives / malformed lines */
      }
    }
  }
}

/** Builds a friendly Error from a failed provider response. */
export async function providerError(provider, res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || body?.message || JSON.stringify(body).slice(0, 300);
  } catch {
    detail = res.statusText;
  }
  const hints = {
    401: 'The API key was rejected. Check it in the Vercel environment variables.',
    403: 'This API key is not allowed to use that feature or model.',
    404: 'That model is not available to this API key.',
    429: 'Rate limit or credit limit reached. Wait a moment, or check the remaining credits.',
    529: 'The service is busy right now. Please try again in a minute.',
  };
  const e = new Error(`${provider}: ${hints[res.status] || 'Request failed.'}${detail ? ` (${detail})` : ''}`);
  e.status = res.status;
  e.detail = detail;
  return e;
}

export function addSource(list, url, title) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  const clean = url.trim();
  if (list.some((s) => s.url === clean)) return false;
  list.push({ url: clean, title: (title || '').slice(0, 200) });
  return true;
}
