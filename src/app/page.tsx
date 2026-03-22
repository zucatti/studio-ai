import { redirect } from 'next/navigation';
import { auth0 } from '@/lib/auth0';

export default async function HomePage() {
  console.log('[HomePage] Loading...');

  try {
    const session = await auth0.getSession();
    console.log('[HomePage] Session result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      userId: session?.user?.sub?.substring(0, 10)
    });

    if (session?.user) {
      redirect('/projects');
    } else {
      redirect('/auth/login');
    }
  } catch (error) {
    console.error('[HomePage] ERROR getting session:', error);
    throw error; // Re-throw to see the actual error
  }
}
