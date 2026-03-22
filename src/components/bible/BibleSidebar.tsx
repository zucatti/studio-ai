'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Book, User, MapPin, Package, Music, Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBibleStore, BibleTab } from '@/store/bible-store';
import { BibleCharacters } from './BibleCharacters';
import { BibleLocations } from './BibleLocations';
import { BibleProps } from './BibleProps';
import { BibleAudio } from './BibleAudio';
import { cn } from '@/lib/utils';

const TABS: { value: BibleTab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { value: 'characters', label: 'Personnages', icon: User, description: 'Créer et gérer les personnages' },
  { value: 'locations', label: 'Lieux', icon: MapPin, description: 'Créer et gérer les lieux' },
  { value: 'props', label: 'Accessoires', icon: Package, description: 'Créer et gérer les accessoires' },
  { value: 'audio', label: 'Audio', icon: Music, description: 'Gérer les fichiers audio' },
];

// Bible Générale - Global library for creating/managing all assets
export function BibleSidebar() {
  const params = useParams();
  const projectId = params?.projectId as string | undefined;

  const {
    isOpen,
    activeTab,
    searchQuery,
    isLoading,
    _hasHydrated,
    setOpen,
    setActiveTab,
    setSearchQuery,
    fetchGlobalAssets,
    fetchProjectAssets,
    fetchProjectGenericAssets,
    clearProjectAssets,
  } = useBibleStore();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (_hasHydrated && isOpen) {
      fetchGlobalAssets('');
      // Also fetch project assets to know what's already imported
      if (projectId) {
        fetchProjectAssets(projectId);
        fetchProjectGenericAssets(projectId);
      } else {
        // Clear stale project assets when no project is open
        clearProjectAssets();
      }
    }
  }, [_hasHydrated, isOpen, fetchGlobalAssets, fetchProjectAssets, fetchProjectGenericAssets, clearProjectAssets, projectId]);

  const effectiveIsOpen = _hasHydrated ? isOpen : false;

  if (!mounted) {
    return null;
  }

  const currentTab = TABS.find(t => t.value === activeTab);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'characters':
        return <BibleCharacters projectId={projectId} showGlobalOnly={true} />;
      case 'locations':
        return <BibleLocations projectId={projectId} showGlobalOnly={true} />;
      case 'props':
        return <BibleProps projectId={projectId} showGlobalOnly={true} />;
      case 'audio':
        return <BibleAudio projectId={projectId} showGlobalOnly={true} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={effectiveIsOpen} onOpenChange={setOpen}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20">
                <Book className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-white">Bible Générale</DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  Bibliothèque globale - Créez et gérez vos assets
                </p>
              </div>
            </div>
            {/* Search */}
            <div className="relative w-72 mr-8">
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
        </DialogHeader>

        {/* Main content */}
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar - Tabs */}
          <div className="w-52 border-r border-white/10 p-4 flex-shrink-0">
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

          {/* Right content */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Tab header */}
            <div className="px-6 py-3 border-b border-white/5 flex-shrink-0">
              <h3 className="text-sm font-semibold text-white">{currentTab?.label}</h3>
              <p className="text-xs text-slate-500">{currentTab?.description}</p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-none p-6">
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
      </DialogContent>
    </Dialog>
  );
}

// Toggle button for header
export function BibleToggleButton() {
  const { toggle, _hasHydrated } = useBibleStore();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="gap-2 text-slate-400 hover:text-white"
    >
      <Book className="w-4 h-4" />
      <span className="hidden sm:inline">Bible</span>
    </Button>
  );
}
