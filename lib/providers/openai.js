import 'server-only';
import { OPENAI_BASE, OPENAI_KEY } from '../config';
import { readSSE, providerError, addSource } from './common';

function toInput(msg) {
  if (msg.role === 'assistant') return { role: 'assistant', content: msg.text };
  const content = [];
  for (const a of msg.attachments || []) {
    if (a.kind === 'image' && a.data) {
      content.push({ type: 'input_image', image_url: `data:${a.type};base64,${a.data}` });
    } else if (a.kind === 'pdf' && a.data) {
      content.push({ type: 'input_file', filename: a.name || 'document.pdf', file_data: `data:application/pdf;base64,${a.data}` });
    } else if (a.text != null) {
      content.push({ type: 'input_text', text: `<file name="${a.name}">\n${a.text}\n</file>` });
    }
  }
  content.push({ type: 'input_text', text: msg.text || '(see attached)' });
  return { role: 'user', content };
}

const headers = () => ({ Authorization: `Bearer ${OPENAI_KEY()}`, 'Content-Type': 'application/json' });

/** Streams a reply through the OpenAI Responses API. Same event shape as streamAnthropic. */
export async function* streamOpenAI({ model, system, messages, webSearch, signal }) {
  const body = {
    model: model.id,
    instructions: system,
    input: messages.map(toInput),
    stream: true,
    store: false,
  };
  if (webSearch) body.tools = [{ type: 'web_search' }];
  if (model.reasoning) body.reasoning = { effort: model.reasoning };

  const res = await fetch(`${OPENAI_BASE()}/v1/responses`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  if (!res.ok) throw await providerError('OpenAI', res);

  const usage = { input: 0, output: 0, searches: 0 };
  const sources = [];
  let lastItem = null;
  let wrote = false;

  for await (const { data: ev } of readSSE(res)) {
    switch (ev.type) {
      case 'response.output_text.delta': {
        const item = `${ev.item_id ?? ev.output_index}`;
        if (wrote && lastItem !== null && item !== lastItem) yield { type: 'text', text: '\n\n' };
        lastItem = item;
        if (ev.delta) { wrote = true; yield { type: 'text', text: ev.delta }; }
        break;
      }
      case 'response.output_text.annotation.added': {
        const a = ev.annotation || {};
        if (a.type === 'url_citation' && addSource(sources, a.url, a.title)) yield { type: 'sources', sources: [...sources] };
        break;
      }
      case 'response.web_search_call.in_progress':
      case 'response.web_search_call.searching':
        yield { type: 'status', text: 'Searching the web…' };
        break;
      case 'response.output_item.done': {
        const it = ev.item || {};
        if (it.type === 'web_search_call') {
          usage.searches += 1;
          const q = it.action?.query;
          if (q) yield { type: 'status', text: `Searched: ${q}` };
        }
        if (it.type === 'message') {
          for (const c of it.content || []) for (const a of c.annotations || []) {
            if (a.type === 'url_citation' && addSource(sources, a.url, a.title)) yield { type: 'sources', sources: [...sources] };
          }
        }
        break;
      }
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta':
        if (!wrote) yield { type: 'status', text: 'Thinking…' };
        break;
      case 'response.completed':
      case 'response.incomplete': {
        const u = ev.response?.usage || {};
        usage.input += u.input_tokens || 0;
        usage.output += u.output_tokens || 0;
        if (ev.type === 'response.incomplete') {
          const why = ev.response?.incomplete_details?.reason;
          yield { type: 'text', text: `\n\n*(The reply stopped early${why ? `: ${why.replace(/_/g, ' ')}` : ''}.)*` };
        }
        break;
      }
      case 'response.failed':
        throw new Error(`OpenAI: ${ev.response?.error?.message || 'the request failed'}`);
      case 'error':
        throw new Error(`OpenAI: ${ev.message || ev.error?.message || 'stream error'}`);
    }
  }
  yield { type: 'usage', ...usage };
}

export async function completeOpenAI({ model, system, prompt }) {
  const res = await fetch(`${OPENAI_BASE()}/v1/responses`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model, instructions: system, input: prompt, store: false, reasoning: { effort: 'none' } }),
  });
  if (!res.ok) throw await providerError('OpenAI', res);
  const data = await res.json();
  if (data.output_text) return data.output_text;
  return (data.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content || [])
    .map((c) => c.text || '')
    .join('');
}

// ---------------- images ----------------
const OPTIONAL_IMAGE_PARAMS = ['output_format', 'output_compression', 'quality', 'size', 'moderation'];

async function imageRequest(url, makeBody, params) {
  let p = { ...params };
  for (let attempt = 0; attempt < 3; attempt++) {
    const { body, json } = makeBody(p);
    const res = await fetch(url, {
      method: 'POST',
      headers: json ? headers() : { Authorization: `Bearer ${OPENAI_KEY()}` },
      body,
    });
    if (res.ok) return res.json();
    const err = await providerError('OpenAI', res);
    // If a newer/older image model rejects an optional setting, drop it and retry.
    const bad = res.status === 400 && OPTIONAL_IMAGE_PARAMS.find((k) => k in p && err.detail?.includes(k));
    if (!bad) throw err;
    delete p[bad];
    if (bad === 'output_format') delete p.output_compression;
  }
  throw new Error('OpenAI: the image request could not be completed.');
}

/**
 * Creates (or edits, when `sources` has images) one image.
 * Returns { b64, revisedPrompt, usage }.
 */
export async function createImage({ model, prompt, size, quality, sources = [] }) {
  const params = { output_format: 'jpeg', output_compression: 90 };
  if (size && size !== 'auto') params.size = size;
  if (quality && quality !== 'auto') params.quality = quality;

  let data;
  if (sources.length) {
    data = await imageRequest(`${OPENAI_BASE()}/v1/images/edits`, (p) => {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      for (const [k, v] of Object.entries(p)) form.append(k, String(v));
      sources.forEach((s, i) => {
        const ext = (s.type || 'image/png').split('/')[1] || 'png';
        form.append('image[]', new Blob([Buffer.from(s.data, 'base64')], { type: s.type }), `image-${i}.${ext}`);
      });
      return { body: form, json: false };
    }, params);
  } else {
    data = await imageRequest(`${OPENAI_BASE()}/v1/images/generations`, (p) => ({
      body: JSON.stringify({ model, prompt, n: 1, ...p }),
      json: true,
    }), params);
  }
  const first = data?.data?.[0];
  if (!first?.b64_json) throw new Error('OpenAI: no image came back. The prompt may have been blocked by the safety system.');
  return { b64: first.b64_json, revisedPrompt: first.revised_prompt || '', usage: data.usage || null };
}
