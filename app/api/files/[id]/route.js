import { withUser, fail } from '@/lib/http';
import { getAttachment } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req, { params, user }) => {
  const { id } = await params;
  const att = await getAttachment(user.id, id);
  if (!att) return fail('File not found', 404);

  const download = new URL(req.url).searchParams.has('download');
  const body = att.data != null ? Buffer.from(att.data, 'base64') : Buffer.from(att.text || '', 'utf8');
  const type = att.data != null ? att.type : 'text/plain; charset=utf-8';
  const inline = !download && att.kind === 'image';
  const safeName = (att.name || 'file').replace(/["\\\r\n]/g, '');

  return new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(body.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(att.name || 'file')}`,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
