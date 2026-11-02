import { withUser, json } from '@/lib/http';
import { getUsage } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (req, { user }) => {
  const m = new URL(req.url).searchParams.get('month');
  return json(await getUsage(user.id, /^\d{4}-\d{2}$/.test(m || '') ? m : undefined));
});
