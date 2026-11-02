import 'server-only';
import { ANTHROPIC_BASE, ANTHROPIC_KEY, ANTHROPIC_MAX_TOKENS, ANTHROPIC_SEARCH_TOOL, SEARCH_MAX_USES } from '../config';
import { readSSE, providerError, addSource } from './common';

function toContent(msg, isLastUser) {
  if (msg.role === 'assistant') return [{ type: 'text', text: msg.text }];
  const blocks = [];
  for (const a of msg.attachments || []) {
    if (a.kind === 'image' && a.data) {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: a.type, data: a.data } });
    } else if (a.kind === 'pdf' && a.data) {
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data }, title: a.name });
    } else if (a.text != null) {
      blocks.push({ type: 'text', text: `<file name="${a.name}">\n${a.text}\n</file>` });
    }
  }
  blocks.push({ type: 'text', text: msg.text || '(see attached)' });
  // Cache everything up to the newest user turn, so follow-up questions about
  // long chats or big PDFs are cheaper. Ignored by the API for short prompts.
  if (isLastUser) blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  return blocks;
}

/**
 * Streams a reply from Claude. Yields:
 *   { type: 'text', text } | { type: 'status', text } | { type: 'sources', sources } | { type: 'usage', ... }
 */
export async function* streamAnthropic({ model, system, messages, webSearch, signal }) {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user');
  const apiMessages = messages.map((m, i) => ({ role: m.role, content: toContent(m, i === lastUser) }));

  const body = {
    model: model.id,
    max_tokens: model.maxTokens || ANTHROPIC_MAX_TOKENS(),
    system: [{ type: 'text', text: system }],
    messages: apiMessages,
    stream: true,
  };
  if (webSearch) body.tools = [{ type: ANTHROPIC_SEARCH_TOOL(), name: 'web_search', max_uses: SEARCH_MAX_USES() }];

  const usage = { input: 0, output: 0, searches: 0 };
  const cited = [];
  const found = [];

  for (let round = 0; round < 4; round++) {
    const res = await fetch(`${ANTHROPIC_BASE()}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await providerError('Anthropic', res);

    const blocks = [];
    let stopReason = null;

    for await (const { data: ev } of readSSE(res)) {
      switch (ev.type) {
        case 'message_start': {
          const u = ev.message?.usage || {};
          usage.input += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
          break;
        }
        case 'content_block_start': {
          const b = structuredClone(ev.content_block);
          blocks[ev.index] = b;
          if (b.type === 'text' && b.text) yield { type: 'text', text: b.text };
          if (b.type === 'server_tool_use') { b._json = ''; yield { type: 'status', text: 'Searching the web…' }; }
          if (b.type === 'web_search_tool_result') {
            if (Array.isArray(b.content)) {
              for (const r of b.content) addSource(found, r.url, r.title);
              yield { type: 'status', text: `Reading ${b.content.length} results…` };
            } else if (b.content?.error_code) {
              yield { type: 'status', text: `Search problem: ${b.content.error_code.replace(/_/g, ' ')}` };
            }
          }
          break;
        }
        case 'content_block_delta': {
          const b = blocks[ev.index];
          const d = ev.delta || {};
          if (d.type === 'text_delta') {
            if (b) b.text = (b.text || '') + d.text;
            yield { type: 'text', text: d.text };
          } else if (d.type === 'input_json_delta' && b) {
            b._json = (b._json || '') + (d.partial_json || '');
          } else if (d.type === 'citations_delta' && b) {
            (b.citations ||= []).push(d.citation);
            if (addSource(cited, d.citation?.url, d.citation?.title)) yield { type: 'sources', sources: [...cited] };
          }
          break;
        }
        case 'content_block_stop': {
          const b = blocks[ev.index];
          if (b && '_json' in b) {
            try { b.input = b._json ? JSON.parse(b._json) : b.input || {}; } catch { b.input = b.input || {}; }
            delete b._json;
            if (b.type === 'server_tool_use' && b.input?.query) yield { type: 'status', text: `Searching: ${b.input.query}` };
          }
          break;
        }
        case 'message_delta': {
          stopReason = ev.delta?.stop_reason || stopReason;
          const u = ev.usage || {};
          usage.output += u.output_tokens || 0;
          usage.searches += u.server_tool_use?.web_search_requests || 0;
          break;
        }
        case 'error':
          throw new Error(`Anthropic: ${ev.error?.message || 'stream error'}`);
      }
    }

    if (stopReason === 'pause_turn') {
      // Long searches pause; send the partial turn back unchanged to let Claude continue.
      body.messages = [...body.messages, { role: 'assistant', content: blocks.filter(Boolean) }];
      continue;
    }
    if (stopReason === 'max_tokens') yield { type: 'text', text: '\n\n*(The reply hit the length limit. Ask me to continue.)*' };
    if (stopReason === 'refusal') yield { type: 'status', text: 'The model declined to continue.' };
    break;
  }

  if (!cited.length && found.length) yield { type: 'sources', sources: found.slice(0, 6) };
  yield { type: 'usage', ...usage };
}

/** One-shot, non-streaming completion (used for chat titles). */
export async function completeAnthropic({ model, system, prompt, maxTokens = 60 }) {
  const res = await fetch(`${ANTHROPIC_BASE()}/v1/messages`, {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw await providerError('Anthropic', res);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}
