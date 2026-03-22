import { getSessionWithProxy } from '@/lib/auth0';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { BibleSidebar } from '@/components/bible/BibleSidebar';
import { QueueProvider } from '@/components/queue/QueueProvider';
import { checkUserAccess } from '@/lib/user-access';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionWithProxy();

  if (!session?.user) {
    redirect('/auth/login');
  }

  // Check if user is authorized (active in database)
  const { isAuthorized } = await checkUserAccess();

  if (!isAuthorized) {
    redirect('/unauthorized');
  }

  return (
    <QueueProvider>
      <div className="flex h-screen overflow-hidden bg-[#0a0f16]">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-6 bg-[#0d1520]">
            {children}
          </main>
        </div>
        {/* Bible Générale - available globally */}
        <BibleSidebar />
      </div>
    </QueueProvider>
  );
}
