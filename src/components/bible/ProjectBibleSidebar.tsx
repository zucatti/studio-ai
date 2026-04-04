'use client';

import { useEffect, useState, useCallback } from 'react';
import { Book, User, Users, MapPin, Package, Music, Search, X, Loader2, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBibleStore, type BibleTab } from '@/store/bible-store';
import { ProjectCasting } from './ProjectCasting';
import { cn } from '@/lib/utils';

// Project bible tabs
type ProjectBibleTab = 'casting' | 'locations' | 'props' | 'audio';

const TABS: { value: ProjectBibleTab; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { value: 'casting', label: 'Casting', icon: Users, description: 'Starring et Figurants' },
  { value: 'locations', label: 'Lieux', icon: MapPin, description: 'Decors du projet' },
  { value: 'props', label: 'Accessoires', icon: Package, description: 'Objets du projet' },
  { value: 'audio', label: 'Audio', icon: Music, description: 'Musiques et sons' },
];

interface ProjectBibleSidebarProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectBibleSidebar({ projectId, open, onOpenChange }: ProjectBibleSidebarProps) {
  const {
    projectAssets,
    projectGenericAssets,
    isLoading,
    fetchProjectAssets,
    fetchProjectGenericAssets,
    setOpen: openGlobalBible,
  } = useBibleStore();

  const [activeTab, setActiveTab] = useState<ProjectBibleTab>('casting');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open && projectId) {
      fetchProjectAssets(projectId);
      fetchProjectGenericAssets(projectId);
    }
  }, [open, projectId, fetchProjectAssets, fetchProjectGenericAssets]);

  const handleOpenGlobalBible = useCallback(() => {
    onOpenChange(false);
    openGlobalBible(true);
  }, [onOpenChange, openGlobalBible]);

  // Count assets by type
  const characters = projectAssets.filter(a => a.asset_type === 'character');
  const locations = projectAssets.filter(a => a.asset_type === 'location');
  const props = projectAssets.filter(a => a.asset_type === 'prop');
  const audio = projectAssets.filter(a => a.asset_type === 'audio');

  // Starring = characters with reference images (custom or generic)
  const starringCustom = characters.filter(c => c.reference_images && c.reference_images.length > 0);
  const starringGeneric = projectGenericAssets.filter(g => g.hasReferenceImages);
  const starringCount = starringCustom.length + starringGeneric.length;

  // People = characters without reference images
  const peopleCustom = characters.filter(c => !c.reference_images || c.reference_images.length === 0);
  const peopleGeneric = projectGenericAssets.filter(g => !g.hasReferenceImages);
  const peopleCount = peopleCustom.length + peopleGeneric.length;

  const currentTab = TABS.find(t => t.value === activeTab);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'casting':
        return (
          <ProjectCasting
            projectId={projectId}
            searchQuery={searchQuery}
            onOpenGlobalBible={handleOpenGlobalBible}
          />
        );
      case 'locations':
        return (
          <ProjectLocationsList
            projectId={projectId}
            locations={locations}
            searchQuery={searchQuery}
            onOpenGlobalBible={handleOpenGlobalBible}
          />
        );
      case 'props':
        return (
          <ProjectPropsList
            projectId={projectId}
            props={props}
            searchQuery={searchQuery}
            onOpenGlobalBible={handleOpenGlobalBible}
          />
        );
      case 'audio':
        return (
          <ProjectAudioList
            projectId={projectId}
            audio={audio}
            searchQuery={searchQuery}
            onOpenGlobalBible={handleOpenGlobalBible}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Book className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-white">Bible du Projet</DialogTitle>
                <p className="text-xs text-slate-400 mt-0.5">
                  {starringCount} starring, {peopleCount} figurants, {locations.length} lieux
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative w-64">
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
              {/* Open Global Bible */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenGlobalBible}
                className="mr-8 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              >
                <Book className="w-4 h-4 mr-2" />
                Bible generale
              </Button>
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
                let count = 0;
                if (tab.value === 'casting') count = characters.length + projectGenericAssets.length;
                else if (tab.value === 'locations') count = locations.length;
                else if (tab.value === 'props') count = props.length;
                else if (tab.value === 'audio') count = audio.length;

                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors',
                      isActive
                        ? 'bg-green-500/20 text-green-400'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="text-sm font-medium">{tab.label}</span>
                    </div>
                    {count > 0 && (
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        isActive ? 'bg-green-500/30' : 'bg-white/10'
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Casting sub-sections */}
            {activeTab === 'casting' && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <p className="text-xs text-slate-500 mb-2 px-3">Sections</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-amber-400">
                    <Star className="w-3 h-3" />
                    <span>Starring</span>
                    <span className="text-slate-500">({starringCount})</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400">
                    <Users className="w-3 h-3" />
                    <span>Figurants</span>
                    <span className="text-slate-500">({peopleCount})</span>
                  </div>
                </div>
              </div>
            )}
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
                  <Loader2 className="w-6 h-6 text-green-400 animate-spin" />
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

// Simple lists for other tabs (locations, props, audio)
import { StorageThumbnail } from '@/components/ui/storage-image';
import { Trash2, Plus } from 'lucide-react';
import type { ProjectAssetFlat } from '@/types/database';

function ProjectLocationsList({
  projectId,
  locations,
  searchQuery,
  onOpenGlobalBible,
}: {
  projectId: string;
  locations: ProjectAssetFlat[];
  searchQuery: string;
  onOpenGlobalBible: () => void;
}) {
  const { removeProjectAsset } = useBibleStore();

  const filtered = locations.filter(loc =>
    !searchQuery || loc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MapPin className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun lieu dans ce projet</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalBible}
          className="mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Importer depuis la Bible
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
      {filtered.map((location) => (
        <div key={location.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-start gap-3">
            {location.reference_images?.[0] ? (
              <StorageThumbnail
                src={location.reference_images[0]}
                alt={location.name}
                size={56}
                className="rounded-lg"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-green-500/10 flex items-center justify-center">
                <MapPin className="w-6 h-6 text-green-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{location.name}</p>
              <p className="text-xs text-green-400 font-mono">#{location.name.replace(/\s+/g, '')}</p>
            </div>
            <button
              onClick={() => removeProjectAsset(projectId, location.project_asset_id)}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectPropsList({
  projectId,
  props,
  searchQuery,
  onOpenGlobalBible,
}: {
  projectId: string;
  props: ProjectAssetFlat[];
  searchQuery: string;
  onOpenGlobalBible: () => void;
}) {
  const { removeProjectAsset } = useBibleStore();

  const filtered = props.filter(prop =>
    !searchQuery || prop.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Package className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun accessoire dans ce projet</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalBible}
          className="mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Importer depuis la Bible
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
      {filtered.map((prop) => (
        <div key={prop.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-start gap-3">
            {prop.reference_images?.[0] ? (
              <StorageThumbnail
                src={prop.reference_images[0]}
                alt={prop.name}
                size={56}
                className="rounded-lg"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Package className="w-6 h-6 text-orange-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{prop.name}</p>
              <p className="text-xs text-orange-400 font-mono">#{prop.name.replace(/\s+/g, '')}</p>
            </div>
            <button
              onClick={() => removeProjectAsset(projectId, prop.project_asset_id)}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectAudioList({
  projectId,
  audio,
  searchQuery,
  onOpenGlobalBible,
}: {
  projectId: string;
  audio: ProjectAssetFlat[];
  searchQuery: string;
  onOpenGlobalBible: () => void;
}) {
  const { removeProjectAsset } = useBibleStore();

  const filtered = audio.filter(a =>
    !searchQuery || a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Music className="w-12 h-12 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">Aucun audio dans ce projet</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenGlobalBible}
          className="mt-4 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
        >
          <Plus className="w-4 h-4 mr-2" />
          Importer depuis la Bible
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {filtered.map((a) => (
        <div key={a.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Music className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{a.name}</p>
              <p className="text-xs text-slate-500">
                {(a.data as { audioType?: string })?.audioType || 'audio'}
              </p>
            </div>
            <button
              onClick={() => removeProjectAsset(projectId, a.project_asset_id)}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Export button for use in topbar
export function ProjectBibleToggleButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-green-400 hover:text-green-300 hover:bg-green-500/10"
      >
        <Book className="w-4 h-4" />
        <span className="hidden sm:inline">Projet</span>
      </Button>
      <ProjectBibleSidebar projectId={projectId} open={open} onOpenChange={setOpen} />
    </>
  );
}
