import { withUser, json, fail, readJSON } from '@/lib/http';
import { getChat, saveChat, renameChat, deleteChat } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (_req, { params, user }) => {
  const { id } = await params;
  const chat = await getChat(user.id, id);
  return chat ? json({ chat }) : fail('Chat not found', 404);
});

// Save the whole chat (the browser sends it after each exchange).
export const PUT = withUser(async (req, { params, user }) => {
  const { id } = await params;
  const body = await readJSON(req);
  const existing = await getChat(user.id, id);
  const chat = await saveChat(user.id, {
    ...body,
    id,
    createdAt: existing?.createdAt,
    title: body.title || existing?.title,
  });
  return json({ chat: { id: chat.id, title: chat.title, updatedAt: chat.updatedAt } });
});

export const PATCH = withUser(async (req, { params, user }) => {
  const { id } = await params;
  const { title } = await readJSON(req);
  const chat = await renameChat(user.id, id, title);
  return chat ? json({ ok: true, title: chat.title }) : fail('Chat not found', 404);
});

export const DELETE = withUser(async (_req, { params, user }) => {
  const { id } = await params;
  await deleteChat(user.id, id);
  return json({ ok: true });
});
