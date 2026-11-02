import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

// Tiny key-value layer.
//  - Production: Upstash Redis over its REST API (works with the Vercel Marketplace
//    integration, which sets KV_REST_API_URL/TOKEN or UPSTASH_REDIS_REST_URL/TOKEN).
//  - Local development: an in-memory store saved to .data/store.json.

const URL_ = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim().replace(/\/+$/, '');
const TOKEN = () => (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();

export const storageKind = () => (URL_() && TOKEN() ? 'redis' : 'memory');

// ---------- Upstash REST ----------
async function upstash(pathname, body) {
  const res = await fetch(URL_() + pathname, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Storage error (${res.status}): ${data?.error || res.statusText}`);
  return data;
}

// ---------- in-memory fallback ----------
const g = globalThis;
const FILE = path.join(process.cwd(), '.data', 'store.json');
function mem() {
  if (!g.__kvMem) {
    g.__kvMem = { strings: {}, hashes: {}, zsets: {}, exp: {} };
    try {
      if (process.env.NODE_ENV !== 'production' && fs.existsSync(FILE)) g.__kvMem = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {}
  }
  return g.__kvMem;
}
let saveTimer = null;
function persist() {
  if (process.env.NODE_ENV === 'production') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(mem()));
    } catch {}
  }, 200);
}
function expired(m, k) {
  if (m.exp[k] && m.exp[k] < Date.now()) {
    delete m.strings[k]; delete m.hashes[k]; delete m.zsets[k]; delete m.exp[k];
  }
}
function memCmd([op, ...a]) {
  const m = mem();
  op = String(op).toUpperCase();
  if (a[0] != null) expired(m, a[0]);
  switch (op) {
    case 'GET': return m.strings[a[0]] ?? null;
    case 'SET': m.strings[a[0]] = String(a[1]); persist(); return 'OK';
    case 'DEL': { let n = 0; for (const k of a) { if (k in m.strings || k in m.hashes || k in m.zsets) n++; delete m.strings[k]; delete m.hashes[k]; delete m.zsets[k]; } persist(); return n; }
    case 'INCR': { const v = (Number(m.strings[a[0]]) || 0) + 1; m.strings[a[0]] = String(v); return v; }
    case 'EXPIRE': m.exp[a[0]] = Date.now() + Number(a[1]) * 1000; return 1;
    case 'HSET': { const h = (m.hashes[a[0]] ||= {}); for (let i = 1; i < a.length; i += 2) h[a[i]] = String(a[i + 1]); persist(); return 1; }
    case 'HDEL': { const h = m.hashes[a[0]] || {}; for (const f of a.slice(1)) delete h[f]; persist(); return 1; }
    case 'HMGET': { const h = m.hashes[a[0]] || {}; return a.slice(1).map((f) => h[f] ?? null); }
    case 'HINCRBY': { const h = (m.hashes[a[0]] ||= {}); h[a[1]] = String((Number(h[a[1]]) || 0) + Number(a[2])); persist(); return Number(h[a[1]]); }
    case 'HGETALL': { const h = m.hashes[a[0]] || {}; return Object.entries(h).flat(); }
    case 'ZADD': { const z = (m.zsets[a[0]] ||= {}); z[a[2]] = Number(a[1]); persist(); return 1; }
    case 'ZREM': { const z = m.zsets[a[0]] || {}; for (const k of a.slice(1)) delete z[k]; persist(); return 1; }
    case 'ZREVRANGE': {
      const z = m.zsets[a[0]] || {};
      const sorted = Object.entries(z).sort((x, y) => y[1] - x[1]);
      const stop = Number(a[2]) < 0 ? sorted.length : Number(a[2]) + 1;
      return sorted.slice(Number(a[1]), stop).map(([k]) => k);
    }
    default: throw new Error('Unsupported memory command ' + op);
  }
}

/** Run one command, e.g. cmd('GET', 'key'). */
export async function cmd(...args) {
  if (storageKind() === 'memory') return memCmd(args);
  const data = await upstash('', args.map(String));
  if (data?.error) throw new Error('Storage error: ' + data.error);
  return data.result;
}

/** Run several commands in one round trip. Returns an array of results. */
export async function pipeline(commands) {
  if (!commands.length) return [];
  if (storageKind() === 'memory') return commands.map(memCmd);
  const data = await upstash('/pipeline', commands.map((c) => c.map(String)));
  return data.map((r) => {
    if (r.error) throw new Error('Storage error: ' + r.error);
    return r.result;
  });
}
