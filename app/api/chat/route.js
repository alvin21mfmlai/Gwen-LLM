import { withUser, fail, readJSON } from '@/lib/http';
import { findModel } from '@/lib/config';
import { getAttachments, getSettings, addUsage } from '@/lib/store';
import { systemPrompt } from '@/lib/prompt';
import { streamAnthropic } from '@/lib/providers/anthropic';
import { streamOpenAI } from '@/lib/providers/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds; long answers with web search can take a while

const MAX_HISTORY = 60;

/** Turns stored chat messages into a clean, alternating user/assistant list. */
function prepare(messages) {
  const out = [];
  for (const m of messages.slice(-MAX_HISTORY)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || m.error) continue;
    let text = String(m.content || '');
    if (m.role === 'assistant' && !text.trim()) {
      if (m.images?.length) text = `[I created ${m.images.length > 1 ? 'images' : 'an image'} here${m.imagePrompt ? ` for the prompt: “${m.imagePrompt}”` : ''}.]`;
      else continue;
    }
    const attIds = m.role === 'user' ? (m.attachments || []).map((a) => a.id) : [];
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      prev.text += '\n\n' + text;
      prev.attIds.push(...attIds);
    } else {
      out.push({ role: m.role, text, attIds });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

export const POST = withUser(async (req, { user }) => {
  const body = await readJSON(req);
  const model = findModel(body.model);
  if (!model) return fail('That model is not available. Pick another one from the menu at the top.');

  const history = prepare(Array.isArray(body.messages) ? body.messages : []);
  if (!history.length || history[history.length - 1].role !== 'user') return fail('There is no message to answer.');

  const [settings, files] = await Promise.all([
    getSettings(user.id),
    getAttachments(user.id, history.flatMap((m) => m.attIds)),
  ]);
  const messages = history.map((m) => ({ role: m.role, text: m.text, attachments: m.attIds.map((id) => files[id]).filter(Boolean) }));
  const webSearch = !!body.webSearch;
  const system = systemPrompt({ settings, userName: user.name, timeZone: body.timeZone, webSearch });

  const upstream = new AbortController();
  req.signal?.addEventListener('abort', () => upstream.abort());
  const run = model.provider === 'anthropic' ? streamAnthropic : streamOpenAI;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n')); } catch {}
      };
      const ping = setInterval(() => send({ t: 'ping' }), 15000);
      let usage = null;
      try {
        for await (const ev of run({ model, system, messages, webSearch, signal: upstream.signal })) {
          if (ev.type === 'text') send({ t: 'text', v: ev.text });
          else if (ev.type === 'status') send({ t: 'status', v: ev.text });
          else if (ev.type === 'sources') send({ t: 'sources', v: ev.sources });
          else if (ev.type === 'usage') { usage = ev; send({ t: 'usage', v: { input: ev.input, output: ev.output, searches: ev.searches } }); }
        }
        send({ t: 'done' });
      } catch (e) {
        if (e?.name !== 'AbortError') {
          console.error('chat error:', e?.message);
          send({ t: 'error', v: e?.message || 'Something went wrong.' });
        }
      } finally {
        clearInterval(ping);
        if (usage) await addUsage(user.id, model.id, usage);
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});
