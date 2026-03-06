'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/auth/login?screen_hint=signup');
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400">Redirection vers l'inscription...</p>
    </div>
  );
}
