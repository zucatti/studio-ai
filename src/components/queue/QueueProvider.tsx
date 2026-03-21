'use client';

import { QueuePanel } from './QueuePanel';

export function QueueProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <QueuePanel />
    </>
  );
}
