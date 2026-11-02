import { withUser, json, readJSON } from '@/lib/http';
import { providers } from '@/lib/config';
import { completeAnthropic } from '@/lib/providers/anthropic';
import { completeOpenAI } from '@/lib/providers/openai';

export const dynamic = 'force-dynamic';

const SYSTEM = 'You name chat conversations. Reply with a short, specific title of 2 to 6 words in the same language as the conversation. No quotes, no emoji, no full stop.';

function fallback(text) {
  const words = String(text || 'New chat').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  return words.length > 48 ? words.slice(0, 47) + '…' : words || 'New chat';
}

export const POST = withUser(async (req) => {
  const { user: userText = '', assistant = '' } = await readJSON(req);
  const prompt = `Conversation start:\n\nUser: ${String(userText).slice(0, 1500)}\n\nAssistant: ${String(assistant).replace(/<\/?document[^>]*>/g, '').slice(0, 800)}\n\nTitle:`;
  const p = providers();
  const custom = (process.env.TITLE_MODEL || '').trim();
  let title = '';
  try {
    if (p.anthropic && (!custom || custom.startsWith('claude'))) {
      title = await completeAnthropic({ model: custom || 'claude-haiku-5-5', system: SYSTEM, prompt });
    } else if (p.openai) {
      title = await completeOpenAI({ model: custom || 'gpt-6-luna', system: SYSTEM, prompt });
    }
  } catch (e) {
    console.warn('title generation failed:', e.message);
  }
  title = title.replace(/^["'“”#*\s]+|["'“”.*\s]+$/g, '').split('\n')[0].slice(0, 60);
  return json({ title: title || fallback(userText) });
});
