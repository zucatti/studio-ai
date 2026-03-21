'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Settings,
  Camera,
  ChevronRight,
  CreditCard,
  History,
} from 'lucide-react';
import Link from 'next/link';
import { CreditDashboard, UsageHistory } from '@/components/settings';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('credits');

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-400" />
          <h1 className="text-xl font-semibold text-white">Configuration & Usage</h1>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-800/50 border border-white/10 w-full justify-start">
          <TabsTrigger value="credits" className="flex items-center gap-2 data-[state=active]:bg-slate-700">
            <CreditCard className="w-4 h-4" />
            Crédits & Budgets
          </TabsTrigger>
          <TabsTrigger value="usage" className="flex items-center gap-2 data-[state=active]:bg-slate-700">
            <History className="w-4 h-4" />
            Historique
          </TabsTrigger>
        </TabsList>

        {/* Credits Tab */}
        <TabsContent value="credits" className="mt-6">
          <CreditDashboard isActive={activeTab === 'credits'} />
        </TabsContent>

        {/* Usage History Tab */}
        <TabsContent value="usage" className="mt-6">
          <UsageHistory />
        </TabsContent>
      </Tabs>

      {/* Camera Movements - Temporary section at bottom */}
      <div className="mt-8 pt-6 border-t border-white/10">
        <Link
          href="/settings/camera-movements"
          className="flex items-center justify-between p-4 bg-slate-800/40 hover:bg-slate-800/60 border border-white/5 hover:border-white/10 rounded-xl transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Camera className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="font-medium text-white group-hover:text-cyan-300 transition-colors">
                Mouvements de Caméra
              </div>
              <div className="text-sm text-slate-500">
                38 mouvements professionnels avec aperçus vidéo
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
        </Link>
      </div>
    </div>
  );
}
