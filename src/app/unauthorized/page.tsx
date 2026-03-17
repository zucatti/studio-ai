'use client';

import { useEffect, useState } from 'react';
import { ShieldX, Mail, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user info to display email
    fetch('/api/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.email) {
          setUserEmail(data.email);
        }
      })
      .catch(() => {});
  }, []);

  const handleLogout = () => {
    window.location.href = '/auth/logout';
  };

  const handleRetry = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-[#0a0f16] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Card */}
        <div className="bg-[#0d1520] border border-slate-800 rounded-2xl p-8 shadow-2xl">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center">
                <ShieldX className="w-10 h-10 text-red-500" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            Accès non autorisé
          </h1>

          {/* Description */}
          <p className="text-slate-400 text-center mb-6">
            Votre compte n&apos;est pas encore activé pour accéder à cette application.
          </p>

          {/* User info */}
          {userEmail && (
            <div className="bg-slate-900/50 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-slate-400" />
                </div>
                <div>
                  <div className="text-sm text-slate-500">Connecté en tant que</div>
                  <div className="text-white font-medium">{userEmail}</div>
                </div>
              </div>
            </div>
          )}

          {/* Help text */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
            <p className="text-amber-200 text-sm">
              <strong>Besoin d&apos;accès ?</strong><br />
              Contactez l&apos;administrateur pour activer votre compte.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleRetry}
              variant="outline"
              className="w-full bg-slate-800 border-slate-700 text-white hover:bg-slate-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Réessayer
            </Button>

            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Se déconnecter
            </Button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-sm mt-6">
          Studio IA &mdash; Accès restreint
        </p>
      </div>
    </div>
  );
}
