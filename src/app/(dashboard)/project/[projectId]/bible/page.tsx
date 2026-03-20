'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Book, User, MapPin, Package, Music, Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useBibleStore, BibleTab } from '@/store/bible-store';
import { BibleCharacters } from '@/components/bible/BibleCharacters';
import { BibleLocations } from '@/components/bible/BibleLocations';
import { BibleProps } from '@/components/bible/BibleProps';
import { BibleAudio } from '@/components/bible/BibleAudio';
import { cn } from '@/lib/utils';

const TABS: { value: BibleTab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { value: 'characters', label: 'Personnages', icon: User, description: 'Gérer les personnages du projet' },
  { value: 'locations', label: 'Lieux', icon: MapPin, description: 'Gérer les lieux du projet' },
  { value: 'props', label: 'Accessoires', icon: Package, description: 'Gérer les accessoires du projet' },
  { value: 'audio', label: 'Audio', icon: Music, description: 'Gérer les fichiers audio' },
];

export default function BiblePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const {
    activeTab,
    searchQuery,
    isLoading,
    setActiveTab,
    setSearchQuery,
    fetchGlobalAssets,
    fetchProjectAssets,
    fetchProjectGenericAssets,
  } = useBibleStore();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && projectId) {
      fetchGlobalAssets('');
      fetchProjectAssets(projectId);
      fetchProjectGenericAssets(projectId);
    }
  }, [mounted, projectId, fetchGlobalAssets, fetchProjectAssets, fetchProjectGenericAssets]);

  const currentTab = TABS.find(t => t.value === activeTab);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'characters':
        return <BibleCharacters projectId={projectId} />;
      case 'locations':
        return <BibleLocations projectId={projectId} />;
      case 'props':
        return <BibleProps projectId={projectId} />;
      case 'audio':
        return <BibleAudio projectId={projectId} />;
      default:
        return null;
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/20">
            <Book className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Bible</h1>
            <p className="text-sm text-slate-400">
              Gérez les personnages, lieux et accessoires du projet
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 pl-9 bg-white/5 border-white/10 text-sm text-white placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex gap-6">
        {/* Left sidebar - Tabs */}
        <div className="w-52 flex-shrink-0">
          <div className="rounded-xl bg-[#151d28] border border-white/5 p-4">
            <div className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                      isActive
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1">
          <div className="rounded-xl bg-[#151d28] border border-white/5">
            {/* Tab header */}
            <div className="px-6 py-4 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">{currentTab?.label}</h3>
              <p className="text-xs text-slate-500">{currentTab?.description}</p>
            </div>

            {/* Content */}
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                </div>
              ) : (
                renderTabContent()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
