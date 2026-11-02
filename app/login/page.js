import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { APP_NAME, users } from '@/lib/config';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUser()) redirect('/');
  return <LoginForm appName={APP_NAME()} configured={users().length > 0} />;
}
