import 'server-only';
import { createHash } from 'node:crypto';
import { DEFAULT_MODELS } from './models';

const env = (k, d = '') => (process.env[k] ?? '').trim() || d;

export const ANTHROPIC_KEY = () => env('ANTHROPIC_API_KEY');
export const OPENAI_KEY = () => env('OPENAI_API_KEY');
export const ANTHROPIC_BASE = () => env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com').replace(/\/+$/, '');
export const OPENAI_BASE = () => env('OPENAI_BASE_URL', 'https://api.openai.com').replace(/\/+$/, '');

export const APP_NAME = () => env('APP_NAME', 'My Assistant');
export const ANTHROPIC_MAX_TOKENS = () => Number(env('ANTHROPIC_MAX_TOKENS', '16000')) || 16000;
export const ANTHROPIC_SEARCH_TOOL = () => env('ANTHROPIC_WEB_SEARCH_TOOL', 'web_search_20250305');
export const SEARCH_MAX_USES = () => Number(env('WEB_SEARCH_MAX_USES', '5')) || 5;
export const IMAGE_MODEL = () => env('IMAGE_MODEL', 'gpt-image-2.5-flare');
export const IMAGE_EDIT_MODEL = () => env('IMAGE_EDIT_MODEL', 'gpt-image-2.5-sunburst');
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5 MB request bodies

export function providers() {
  return { anthropic: !!ANTHROPIC_KEY(), openai: !!OPENAI_KEY() };
}

export function allModels() {
  let list = DEFAULT_MODELS;
  const custom = env('MODELS_JSON');
  if (custom) {
    try {
      const parsed = JSON.parse(custom);
      if (Array.isArray(parsed) && parsed.length) list = parsed;
    } catch {
      console.warn('MODELS_JSON is not valid JSON; using the built-in model list.');
    }
  }
  return list.filter((m) => m && m.id && (m.provider === 'anthropic' || m.provider === 'openai'));
}

export function availableModels() {
  const p = providers();
  return allModels().filter((m) => p[m.provider]);
}

export function findModel(id) {
  return availableModels().find((m) => m.id === id) || null;
}

export function defaultModelId() {
  const list = availableModels();
  const wanted = env('DEFAULT_MODEL');
  return (list.find((m) => m.id === wanted) || list[0] || {}).id || null;
}

/**
 * Users who may sign in.
 *  - APP_PASSWORD=secret            → one user
 *  - APP_USERS="Mei:pw1, Alvin:pw2" → several people, each with their own chat history
 */
export function users() {
  const multi = env('APP_USERS');
  if (multi) {
    return multi
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const i = entry.indexOf(':');
        if (i < 1) return null;
        const name = entry.slice(0, i).trim();
        const password = entry.slice(i + 1).trim();
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user';
        return password ? { id, name, password } : null;
      })
      .filter(Boolean);
  }
  const pw = env('APP_PASSWORD');
  return pw ? [{ id: 'me', name: env('APP_USER_NAME'), password: pw }] : [];
}

export function authSecret() {
  const s = env('AUTH_SECRET');
  if (s) return s;
  // Fallback: derive from the passwords, so changing a password signs everyone out.
  return createHash('sha256')
    .update('personal-llm-chat:' + users().map((u) => u.id + '=' + u.password).join('|'))
    .digest('hex');
}
