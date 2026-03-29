'use client';

import { useState, useEffect } from 'react';
import { User, MapPin, Package, Music, Search, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BibleAssetCard } from './BibleAssetCard';
import { useBibleStore, BibleTab } from '@/store/bible-store';
import type { GlobalAssetType } from '@/types/database';
import { cn } from '@/lib/utils';

interface GlobalAssetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onAssetImported?: (assetId: string) => void;
  filterType?: GlobalAssetType;
}

const TABS: { value: BibleTab; label: string; icon: React.ComponentType<{ className?: string }>; type: GlobalAssetType }[] = [
  { value: 'characters', label: 'Personnages', icon: User, type: 'character' },
  { value: 'locations', label: 'Lieux', icon: MapPin, type: 'location' },
  { value: 'props', label: 'Accessoires', icon: Package, type: 'prop' },
  { value: 'audio', label: 'Audio', icon: Music, type: 'audio' },
];

export function GlobalAssetPicker({
  open,
  onOpenChange,
  projectId,
  onAssetImported,
  filterType,
}: GlobalAssetPickerProps) {
  const [activeTab, setActiveTab] = useState<BibleTab>(filterType ? TABS.find(t => t.type === filterType)?.value || 'characters' : 'characters');
  const [searchQuery, setSearchQuery] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const {
    globalAssets,
    isLoading,
    fetchGlobalAssets,
    fetchProjectAssets,
    importGlobalAsset,
    isAssetInProject,
  } = useBibleStore();

  useEffect(() => {
    if (open) {
      fetchGlobalAssets('');
      // Also fetch project assets to correctly filter already-imported assets
      fetchProjectAssets(projectId);
    }
  }, [open, projectId, fetchGlobalAssets, fetchProjectAssets]);

  const currentTab = TABS.find(t => t.value === activeTab);
  const filteredAssets = globalAssets
    .filter(a => a.asset_type === currentTab?.type)
    .filter(a => !isAssetInProject(a.id))
    .filter(a =>
      searchQuery
        ? a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
        : true
    );

  const handleImport = async (globalAssetId: string) => {
    setImporting(globalAssetId);
    const result = await importGlobalAsset(projectId, globalAssetId);
    setImporting(null);
    if (result && onAssetImported) {
      onAssetImported(globalAssetId);
    }
  };

  const displayTabs = filterType ? TABS.filter(t => t.type === filterType) : TABS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0d1520] border-white/10">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-400" />
            Importer depuis la bibliotheque
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        {displayTabs.length > 1 && (
          <div className="flex gap-1 p-1 bg-white/5 rounded-lg">
            {displayTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                    activeTab === tab.value
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="max-h-[400px] overflow-y-auto scrollbar-none">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {currentTab && <currentTab.icon className="w-12 h-12 text-slate-500 mb-3" />}
              <p className="text-slate-400 text-sm">
                {searchQuery
                  ? 'Aucun resultat pour cette recherche'
                  : `Tous les ${currentTab?.label.toLowerCase()} sont deja dans le projet`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredAssets.map((asset) => (
                <div key={asset.id} className="relative">
                  <BibleAssetCard
                    asset={asset}
                    onImport={() => handleImport(asset.id)}
                  />
                  {importing === asset.id && (
                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t border-white/10">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-slate-300 hover:bg-white/5"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
