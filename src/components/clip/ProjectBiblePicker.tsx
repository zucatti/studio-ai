'use client';

import { useState, useEffect, useCallback } from 'react';
import { User, MapPin, Package, Search, X, Loader2, Image as ImageIcon, Library, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StorageImg } from '@/components/ui/storage-image';
import { cn } from '@/lib/utils';
import type { GlobalAssetType } from '@/types/database';
import { GlobalAssetPicker } from '@/components/bible/GlobalAssetPicker';

interface BibleAsset {
  id: string;
  name: string;
  asset_type: GlobalAssetType;
  reference_images: string[];
  data?: {
    visual_description?: string;
    looks?: Array<{ id?: string; name: string; description: string; imageUrl: string }>;
  };
  // Selected look IDs from local_overrides
  selected_look_ids?: string[];
}

interface ProjectBiblePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSelect: (imageUrl: string, assetName: string, assetType: GlobalAssetType) => void;
  title?: string;
}

type TabType = 'all' | 'character' | 'location' | 'prop';

const TABS: { value: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'all', label: 'Tout', icon: ImageIcon },
  { value: 'character', label: 'Personnages', icon: User },
  { value: 'location', label: 'Lieux', icon: MapPin },
  { value: 'prop', label: 'Props', icon: Package },
];

export function ProjectBiblePicker({
  open,
  onOpenChange,
  projectId,
  onSelect,
  title = 'Bible du projet',
}: ProjectBiblePickerProps) {
  const [assets, setAssets] = useState<BibleAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGlobalPicker, setShowGlobalPicker] = useState(false);

  const fetchAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/assets`);
      if (res.ok) {
        const data = await res.json();
        // Filter out audio assets and keep only those with reference images or looks
        const visualAssets = (data.assets || []).filter(
          (a: BibleAsset) =>
            a.asset_type !== 'audio' &&
            ((a.reference_images && a.reference_images.length > 0) ||
              (a.data?.looks && a.data.looks.length > 0))
        );
        setAssets(visualAssets);
      }
    } catch (error) {
      console.error('Error fetching project assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) {
      fetchAssets();
      setSearchQuery('');
      setActiveTab('all');
    }
  }, [open, fetchAssets]);

  // Filter assets by tab and search
  const filteredAssets = assets
    .filter((a) => activeTab === 'all' || a.asset_type === activeTab)
    .filter((a) =>
      searchQuery
        ? a.name.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );

  // Get images from an asset (reference_images + selected looks only)
  const getAssetImages = (asset: BibleAsset): { url: string; label?: string }[] => {
    const images: { url: string; label?: string }[] = [];

    // Add reference images
    if (asset.reference_images) {
      asset.reference_images.forEach((url, idx) => {
        images.push({ url, label: idx === 0 ? 'Principal' : `Ref ${idx + 1}` });
      });
    }

    // Add ONLY selected looks for characters
    if (asset.data?.looks && asset.selected_look_ids && asset.selected_look_ids.length > 0) {
      const selectedIds = new Set(asset.selected_look_ids);
      asset.data.looks.forEach((look) => {
        if (look.imageUrl && look.id && selectedIds.has(look.id)) {
          images.push({ url: look.imageUrl, label: look.name });
        }
      });
    }

    return images;
  };

  const handleSelectImage = (imageUrl: string, asset: BibleAsset) => {
    onSelect(imageUrl, asset.name, asset.asset_type);
    onOpenChange(false);
  };

  const handleAssetImported = useCallback(() => {
    // Refresh the asset list after importing
    fetchAssets();
  }, [fetchAssets]);

  const getAssetIcon = (type: GlobalAssetType) => {
    switch (type) {
      case 'character':
        return <User className="w-3 h-3" />;
      case 'location':
        return <MapPin className="w-3 h-3" />;
      case 'prop':
        return <Package className="w-3 h-3" />;
      default:
        return <ImageIcon className="w-3 h-3" />;
    }
  };

  const getAssetColor = (type: GlobalAssetType) => {
    switch (type) {
      case 'character':
        return 'text-blue-400 bg-blue-500/20';
      case 'location':
        return 'text-green-400 bg-green-500/20';
      case 'prop':
        return 'text-orange-400 bg-orange-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-[#0d1520] border-white/10 flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-400" />
              {title}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGlobalPicker(true)}
              className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
            >
              <Library className="w-4 h-4 mr-2" />
              Bibliothèque
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-white/5 rounded-lg flex-shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count =
              tab.value === 'all'
                ? assets.length
                : assets.filter((a) => a.asset_type === tab.value).length;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  activeTab === tab.value
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                <span className="text-xs opacity-60">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Rechercher un asset..."
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
        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ImageIcon className="w-12 h-12 text-slate-500 mb-3" />
              <p className="text-slate-400 text-sm">
                {searchQuery
                  ? 'Aucun résultat pour cette recherche'
                  : 'Aucun asset avec des images dans ce projet'}
              </p>
              <p className="text-slate-500 text-xs mt-1 mb-4">
                Importez des personnages, lieux ou props depuis la bibliothèque
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGlobalPicker(true)}
                className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Importer depuis la bibliothèque
              </Button>
            </div>
          ) : (
            <div className="space-y-6 py-2">
              {filteredAssets.map((asset) => {
                const images = getAssetImages(asset);
                if (images.length === 0) return null;

                return (
                  <div key={asset.id} className="space-y-2">
                    {/* Asset header */}
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex items-center gap-1 px-2 py-0.5 rounded text-xs',
                          getAssetColor(asset.asset_type)
                        )}
                      >
                        {getAssetIcon(asset.asset_type)}
                        {asset.asset_type === 'character'
                          ? 'Personnage'
                          : asset.asset_type === 'location'
                          ? 'Lieu'
                          : 'Prop'}
                      </span>
                      <span className="text-sm font-medium text-white">{asset.name}</span>
                    </div>

                    {/* Images grid */}
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                      {images.map((img, idx) => (
                        <button
                          key={`${asset.id}-${idx}`}
                          onClick={() => handleSelectImage(img.url, asset)}
                          className="group relative aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-purple-500/50 transition-colors"
                        >
                          <StorageImg
                            src={img.url}
                            alt={`${asset.name} - ${img.label || idx + 1}`}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {/* Hover overlay */}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="text-xs text-white font-medium">Sélectionner</span>
                          </div>
                          {/* Label */}
                          {img.label && (
                            <div className="absolute bottom-0 inset-x-0 px-1 py-0.5 bg-black/70 text-[10px] text-white truncate">
                              {img.label}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-4 border-t border-white/10 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-slate-300 hover:bg-white/5"
          >
            Annuler
          </Button>
        </div>
      </DialogContent>

      {/* Global Asset Picker for importing */}
      <GlobalAssetPicker
        open={showGlobalPicker}
        onOpenChange={setShowGlobalPicker}
        projectId={projectId}
        onAssetImported={handleAssetImported}
      />
    </Dialog>
  );
}

export default ProjectBiblePicker;
