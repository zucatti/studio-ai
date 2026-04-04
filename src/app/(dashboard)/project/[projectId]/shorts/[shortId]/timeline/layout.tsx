'use client';

import { useSidebarStore } from '@/store/sidebar-store';

export default function TimelineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLocked, _hasHydrated } = useSidebarStore();
  const sidebarVisible = _hasHydrated ? isLocked : true;

  return (
    <div
      className="fixed top-14 bottom-0 right-0 bg-[#0d1520] z-10"
      style={{ left: sidebarVisible ? '256px' : '0' }}
    >
      {children}
    </div>
  );
}
