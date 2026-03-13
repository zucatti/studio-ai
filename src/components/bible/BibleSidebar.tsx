'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Book, User, MapPin, Package, Music, Search, X, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useBibleStore, BibleTab } from '@/store/bible-store';
import { BibleCharacters } from './BibleCharacters';
import { BibleLocations } from './BibleLocations';
import { BibleProps } from './BibleProps';
import { BibleAudio } from './BibleAudio';
import { GlobalAssetPicker } from './GlobalAssetPicker';
import { cn } from '@/lib/utils';

interface BibleSidebarProps {
  onInsertReference?: (reference: string) => void;
}

const TABS: { value: BibleTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'characters', label: 'Personnages', icon: User },
  { value: 'locations', label: 'Lieux', icon: MapPin },
  { value: 'props', label: 'Accessoires', icon: Package },
  { value: 'audio', label: 'Audio', icon: Music },
];

export function BibleSidebar({ onInsertReference }: BibleSidebarProps) {
  const params = useParams();
  const projectId = params.projectId as string | undefined;

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
  } = useBibleStore();

  const [showPicker, setShowPicker] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (_hasHydrated && isOpen) {
      fetchGlobalAssets('');
      if (projectId) {
        fetchProjectAssets(projectId);
      }
    }
  }, [_hasHydrated, isOpen, projectId, fetchGlobalAssets, fetchProjectAssets]);

  // Use default state until hydrated
  const effectiveIsOpen = _hasHydrated ? isOpen : false;

  if (!mounted || !effectiveIsOpen) {
    return null;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'characters':
        return <BibleCharacters projectId={projectId} onInsertReference={onInsertReference} />;
      case 'locations':
        return <BibleLocations projectId={projectId} onInsertReference={onInsertReference} />;
      case 'props':
        return <BibleProps projectId={projectId} onInsertReference={onInsertReference} />;
      case 'audio':
        return <BibleAudio projectId={projectId} onInsertReference={onInsertReference} />;
      default:
        return null;
    }
  };

  return (
    <>
      {/* Sidebar Panel */}
      <div className="flex flex-col h-full w-72 bg-[#0d1520] border-l border-white/5">
        {/* Header */}
        <div className="flex items-center gap-2 h-14 px-4 border-b border-white/5">
          <Book className="w-5 h-5 text-blue-400" />
          <span className="font-semibold text-white">Bible</span>
          <button
            onClick={() => setOpen(false)}
            className="ml-auto p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 bg-[#1a2433] border-0 text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-blue-500/50 rounded-lg"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-3 pb-3">
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'flex-1 flex items-center justify-center p-2 rounded-md transition-colors',
                    activeTab === tab.value
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                  title={tab.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Title with Import Button */}
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {TABS.find(t => t.value === activeTab)?.label}
          </span>
          {projectId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPicker(true)}
              className="h-6 px-2 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
            >
              <Plus className="w-3 h-3 mr-1" />
              Importer
            </Button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          ) : (
            renderTabContent()
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-white/5">
          <p className="text-[10px] text-slate-500 text-center">
            Cliquez sur un element pour inserer @Reference
          </p>
        </div>
      </div>

      {/* Global Asset Picker Modal */}
      {projectId && (
        <GlobalAssetPicker
          open={showPicker}
          onOpenChange={setShowPicker}
          projectId={projectId}
        />
      )}
    </>
  );
}

// Toggle button component to use in layouts
export function BibleToggleButton() {
  const { isOpen, toggle, _hasHydrated } = useBibleStore();
  const effectiveIsOpen = _hasHydrated ? isOpen : false;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className={cn(
        'gap-2',
        effectiveIsOpen
          ? 'bg-blue-500/20 text-blue-400'
          : 'text-slate-400 hover:text-white'
      )}
    >
      <Book className="w-4 h-4" />
      <span className="hidden sm:inline">Bible</span>
      <ChevronRight className={cn(
        'w-3 h-3 transition-transform',
        effectiveIsOpen && 'rotate-180'
      )} />
    </Button>
  );
}
