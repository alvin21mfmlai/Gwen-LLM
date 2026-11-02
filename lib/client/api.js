// Small fetch helpers for the browser.

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function handle(res) {
  if (res.status === 401) {
    window.location.href = '/login';
    throw new ApiError('Signed out', 401);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  get: (url) => fetch(url, { cache: 'no-store' }).then(handle),
  send: (url, method, body) =>
    fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }).then(handle),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file, file.name);
    return fetch('/api/upload', { method: 'POST', body: form }).then(handle);
  },
};

/** POSTs to /api/chat and calls onEvent for each NDJSON line. Resolves when the stream ends. */
export async function streamChat(body, { signal, onEvent }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) await handle(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line)); } catch {}
    }
  }
  if (buf.trim()) { try { onEvent(JSON.parse(buf)); } catch {} }
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 20);
