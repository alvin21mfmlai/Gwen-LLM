import 'server-only';
import { randomBytes } from 'node:crypto';
import { cmd, pipeline } from './kv';

export const newId = (n = 12) => randomBytes(n).toString('base64url');

const k = {
  chats: (u) => `u:${u}:chats`,
  titles: (u) => `u:${u}:titles`,
  chat: (u, id) => `u:${u}:chat:${id}`,
  att: (u, id) => `u:${u}:att:${id}`,
  settings: (u) => `u:${u}:settings`,
  usage: (u, month) => `u:${u}:usage:${month}`,
};

const parse = (s) => {
  if (s == null) return null;
  try { return JSON.parse(s); } catch { return null; }
};

const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(id);

// ---------------- chats ----------------
export async function listChats(uid, limit = 300) {
  const ids = (await cmd('ZREVRANGE', k.chats(uid), 0, limit - 1)) || [];
  if (!ids.length) return [];
  const [titles, metas] = await pipeline([
    ['HMGET', k.titles(uid), ...ids],
    ['HMGET', k.titles(uid), ...ids.map((id) => id + ':t')],
  ]);
  return ids.map((id, i) => ({ id, title: titles[i] || 'New chat', updatedAt: Number(metas[i]) || 0 }));
}

export async function getChat(uid, id) {
  if (!validId(id)) return null;
  return parse(await cmd('GET', k.chat(uid, id)));
}

export async function saveChat(uid, chat) {
  if (!validId(chat.id)) throw new Error('Bad chat id');
  const now = Date.now();
  const record = {
    id: chat.id,
    title: String(chat.title || 'New chat').slice(0, 120),
    model: chat.model || null,
    createdAt: chat.createdAt || now,
    updatedAt: now,
    messages: Array.isArray(chat.messages) ? chat.messages.slice(-400) : [],
  };
  await pipeline([
    ['SET', k.chat(uid, record.id), JSON.stringify(record)],
    ['ZADD', k.chats(uid), now, record.id],
    ['HSET', k.titles(uid), record.id, record.title, record.id + ':t', now],
  ]);
  return record;
}

export async function renameChat(uid, id, title) {
  const chat = await getChat(uid, id);
  if (!chat) return null;
  chat.title = String(title || '').trim().slice(0, 120) || chat.title;
  await pipeline([
    ['SET', k.chat(uid, id), JSON.stringify(chat)],
    ['HSET', k.titles(uid), id, chat.title],
  ]);
  return chat;
}

export async function deleteChat(uid, id) {
  const chat = await getChat(uid, id);
  const attIds = new Set();
  for (const m of chat?.messages || []) {
    for (const a of m.attachments || []) if (validId(a.id)) attIds.add(a.id);
    for (const a of m.images || []) if (validId(a.id)) attIds.add(a.id);
  }
  await pipeline([
    ['DEL', k.chat(uid, id), ...[...attIds].map((a) => k.att(uid, a))],
    ['ZREM', k.chats(uid), id],
    ['HDEL', k.titles(uid), id, id + ':t'],
  ]);
}

// ---------------- attachments ----------------
// Stored as JSON: { id, name, type, size, kind, data(base64) | text }
export async function putAttachment(uid, att) {
  const id = att.id || newId();
  const record = { ...att, id, createdAt: Date.now() };
  await cmd('SET', k.att(uid, id), JSON.stringify(record));
  return record;
}

export async function getAttachment(uid, id) {
  if (!validId(id)) return null;
  return parse(await cmd('GET', k.att(uid, id)));
}

export async function getAttachments(uid, ids) {
  const clean = [...new Set((ids || []).filter(validId))];
  if (!clean.length) return {};
  const rows = await pipeline(clean.map((id) => ['GET', k.att(uid, id)]));
  const out = {};
  rows.forEach((r, i) => { const v = parse(r); if (v) out[clean[i]] = v; });
  return out;
}

// ---------------- settings ----------------
export const DEFAULT_SETTINGS = { displayName: '', aboutMe: '', style: '', defaultModel: '' };

export async function getSettings(uid) {
  return { ...DEFAULT_SETTINGS, ...(parse(await cmd('GET', k.settings(uid))) || {}) };
}

export async function saveSettings(uid, s) {
  const clean = {
    displayName: String(s.displayName || '').slice(0, 60),
    aboutMe: String(s.aboutMe || '').slice(0, 3000),
    style: String(s.style || '').slice(0, 3000),
    defaultModel: String(s.defaultModel || '').slice(0, 80),
  };
  await cmd('SET', k.settings(uid), JSON.stringify(clean));
  return clean;
}

// ---------------- usage ----------------
const month = (d = new Date()) => d.toISOString().slice(0, 7);

export async function addUsage(uid, model, { input = 0, output = 0, searches = 0, images = 0 } = {}) {
  const key = k.usage(uid, month());
  const ops = [['HINCRBY', key, `${model}|requests`, 1]];
  if (input) ops.push(['HINCRBY', key, `${model}|input`, Math.round(input)]);
  if (output) ops.push(['HINCRBY', key, `${model}|output`, Math.round(output)]);
  if (searches) ops.push(['HINCRBY', key, `${model}|searches`, Math.round(searches)]);
  if (images) ops.push(['HINCRBY', key, `${model}|images`, Math.round(images)]);
  try { await pipeline(ops); } catch (e) { console.warn('usage not recorded:', e.message); }
}

export async function getUsage(uid, m = month()) {
  const flat = (await cmd('HGETALL', k.usage(uid, m))) || [];
  const rows = {};
  for (let i = 0; i < flat.length; i += 2) {
    const [model, field] = String(flat[i]).split('|');
    (rows[model] ||= { model, requests: 0, input: 0, output: 0, searches: 0, images: 0 })[field] = Number(flat[i + 1]) || 0;
  }
  return { month: m, rows: Object.values(rows).sort((a, b) => b.requests - a.requests) };
}

// ---------------- rate limiting ----------------
export async function hit(key, windowSec) {
  const n = await cmd('INCR', key);
  if (n === 1) await cmd('EXPIRE', key, windowSec);
  return n;
}
