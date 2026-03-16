import { auth0 } from '@/lib/auth0';
import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { BibleSidebar } from '@/components/bible/BibleSidebar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth0.getSession();

  if (!session?.user) {
    redirect('/auth/login');
  }

  return (
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
  );
}
