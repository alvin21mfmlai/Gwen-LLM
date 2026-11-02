import { withUser, json } from '@/lib/http';
import { bootData } from '@/lib/boot';

export const dynamic = 'force-dynamic';

export const GET = withUser(async (_req, { user }) => json(await bootData(user)));
