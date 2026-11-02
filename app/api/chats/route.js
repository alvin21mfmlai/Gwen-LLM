import { withUser, json } from '@/lib/http';
import { listChats } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (_req, { user }) => json({ chats: await listChats(user.id) }));
