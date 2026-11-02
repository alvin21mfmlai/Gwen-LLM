import { withUser, json, fail } from '@/lib/http';
import { putAttachment } from '@/lib/store';
import { MAX_UPLOAD_BYTES } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rb|php|sh|sql|yaml|yml|toml|ini|log|rtf|tex|srt|vtt)$/i;
const MAX_TEXT_CHARS = 400_000;

function sniffImage(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}

export const POST = withUser(async (req, { user }) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return fail('No file received.');
  if (file.size > MAX_UPLOAD_BYTES) return fail(`“${file.name}” is too large. The limit is 4 MB per file.`, 413);

  const name = String(file.name || 'file').slice(0, 160);
  const buf = Buffer.from(await file.arrayBuffer());
  const base = { name, size: buf.length };
  let record;

  const imageType = sniffImage(buf);
  if (imageType && IMAGE_TYPES.includes(imageType)) {
    record = { ...base, type: imageType, kind: 'image', data: buf.toString('base64') };
  } else if (buf.slice(0, 5).toString() === '%PDF-') {
    record = { ...base, type: 'application/pdf', kind: 'pdf', data: buf.toString('base64') };
  } else if (/\.docx$/i.test(name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = (await import('mammoth')).default;
    const { value } = await mammoth.extractRawText({ buffer: buf }).catch(() => ({ value: null }));
    if (value == null) return fail(`Could not read “${name}”. Try saving it as PDF.`);
    record = { ...base, type: 'text/plain', kind: 'text', text: value.slice(0, MAX_TEXT_CHARS) };
  } else if (TEXT_EXT.test(name) || (file.type || '').startsWith('text/') || file.type === 'application/json') {
    const text = buf.toString('utf8');
    if (text.includes('\u0000')) return fail(`“${name}” does not look like a text file.`);
    record = { ...base, type: 'text/plain', kind: 'text', text: text.slice(0, MAX_TEXT_CHARS) };
  } else {
    return fail(`“${name}” is not a supported file type. Use images, PDFs, Word (.docx) or text files.`, 415);
  }

  const saved = await putAttachment(user.id, record);
  return json({ attachment: { id: saved.id, name: saved.name, type: saved.type, size: saved.size, kind: saved.kind } });
});
