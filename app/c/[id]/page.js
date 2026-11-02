import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { bootData } from '@/lib/boot';
import App from '@/components/App';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }) {
  const user = await currentUser();
  if (!user) redirect('/login');
  const { id } = await params;
  return <App boot={await bootData(user)} initialChatId={/^[\w-]{6,40}$/.test(id) ? id : null} />;
}
