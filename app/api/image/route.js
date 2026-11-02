import { withUser, json, fail, readJSON } from '@/lib/http';
import { IMAGE_MODEL, IMAGE_EDIT_MODEL, providers } from '@/lib/config';
import { getAttachments, putAttachment, addUsage } from '@/lib/store';
import { createImage } from '@/lib/providers/openai';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return ['image/png', 'png'];
  if (buf[0] === 0xff && buf[1] === 0xd8) return ['image/jpeg', 'jpg'];
  if (buf.slice(8, 12).toString() === 'WEBP') return ['image/webp', 'webp'];
  return ['image/png', 'png'];
}

export const POST = withUser(async (req, { user }) => {
  if (!providers().openai) return fail('Image creation needs an OpenAI API key (OPENAI_API_KEY).', 400);
  const { prompt, size, quality, sourceIds } = await readJSON(req);
  const text = String(prompt || '').trim();
  if (!text) return fail('Describe the image you want.');

  const files = await getAttachments(user.id, Array.isArray(sourceIds) ? sourceIds.slice(0, 8) : []);
  const sources = Object.values(files).filter((a) => a.kind === 'image');
  const model = sources.length ? IMAGE_EDIT_MODEL() : IMAGE_MODEL();

  const result = await createImage({ model, prompt: text.slice(0, 30000), size, quality, sources });
  const buf = Buffer.from(result.b64, 'base64');
  const [type, ext] = sniff(buf);
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
  const saved = await putAttachment(user.id, { name: `${slug}.${ext}`, type, size: buf.length, kind: 'image', data: result.b64 });
  await addUsage(user.id, model, { images: 1, input: result.usage?.input_tokens, output: result.usage?.output_tokens });

  return json({
    image: { id: saved.id, name: saved.name, type, size: buf.length, kind: 'image' },
    revisedPrompt: result.revisedPrompt,
    model,
  });
});
