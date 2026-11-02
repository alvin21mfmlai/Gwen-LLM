import { withUser, json, readJSON } from '@/lib/http';
import { getSettings, saveSettings } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (_req, { user }) => json({ settings: await getSettings(user.id) }));

export const PUT = withUser(async (req, { user }) => json({ settings: await saveSettings(user.id, await readJSON(req)) }));
