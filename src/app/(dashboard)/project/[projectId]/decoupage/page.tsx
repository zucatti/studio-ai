'use client';

import { useParams } from 'next/navigation';
import { DecoupageView } from '@/components/decoupage';

export default function DecoupagePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  return <DecoupageView projectId={projectId} />;
}
