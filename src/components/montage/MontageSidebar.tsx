'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMontageStore, MontageAsset, ClipType } from '@/store/montage-store';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';
import {
  Film,
  Image,
  Music,
  Folder,
  Search,
  GripVertical,
  Play,
  Clock,
  Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MontageSidebarProps {
  projectId: string;
  className?: string;
}

type AssetCategory = 'rushes' | 'videos' | 'images' | 'audio';

const CATEGORY_ICONS: Record<AssetCategory, typeof Film> = {
  rushes: Folder,
  videos: Film,
  images: Image,
  audio: Music,
};

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  rushes: 'Rushes',
  videos: 'Vidéos',
  images: 'Images',
  audio: 'Audio',
};

export function MontageSidebar({ projectId, className }: MontageSidebarProps) {
  const [activeTab, setActiveTab] = useState<AssetCategory>('rushes');
  const [searchQuery, setSearchQuery] = useState('');
  const { assets, setAssets, setLoadingAssets, isLoadingAssets } = useMontageStore();

  // Fetch assets from API
  useEffect(() => {
    const fetchAssets = async () => {
      setLoadingAssets(true);
      try {
        // Fetch rushes
        const rushesRes = await fetch(`/api/projects/${projectId}/rush`);
        const rushes = rushesRes.ok ? await rushesRes.json() : [];

        // Fetch Bible assets (audio, images)
        const bibleRes = await fetch(`/api/projects/${projectId}/bible`);
        const bibleData = bibleRes.ok ? await bibleRes.json() : { assets: [] };

        // Transform to MontageAsset format
        const montageAssets: MontageAsset[] = [];

        // Add rushes - API returns { images: [...] }
        const rushImages = Array.isArray(rushes) ? rushes : (rushes.images || rushes.rushes || []);
        rushImages.forEach((rush: any) => {
          if (rush.video_url) {
            montageAssets.push({
              id: rush.id,
              type: 'rush',
              name: rush.name || rush.prompt?.substring(0, 30) || 'Rush',
              url: rush.video_url,
              thumbnailUrl: rush.thumbnail_url,
              duration: rush.duration,
              metadata: { prompt: rush.prompt },
            });
          } else if (rush.image_url) {
            montageAssets.push({
              id: rush.id,
              type: 'image',
              name: rush.name || rush.prompt?.substring(0, 30) || 'Image',
              url: rush.image_url,
              thumbnailUrl: rush.image_url,
              metadata: { prompt: rush.prompt },
            });
          }
        });

        // Add Bible audio assets
        (bibleData.assets || []).forEach((asset: any) => {
          if (asset.asset_type === 'audio') {
            montageAssets.push({
              id: asset.id,
              type: 'audio',
              name: asset.name,
              url: asset.data?.fileUrl || '',
              duration: asset.data?.duration,
            });
          }
        });

        setAssets(montageAssets);
      } catch (error) {
        console.error('[MontageSidebar] Failed to fetch assets:', error);
      } finally {
        setLoadingAssets(false);
      }
    };

    fetchAssets();
  }, [projectId, setAssets, setLoadingAssets]);

  // Filter assets by category and search
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Category filter
      let matches = false;
      switch (activeTab) {
        case 'rushes':
          matches = asset.type === 'rush';
          break;
        case 'videos':
          matches = asset.type === 'video' || asset.type === 'rush';
          break;
        case 'images':
          matches = asset.type === 'image' || asset.type === 'storyboard';
          break;
        case 'audio':
          matches = asset.type === 'audio';
          break;
      }

      // Search filter
      if (matches && searchQuery) {
        matches = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
      }

      return matches;
    });
  }, [assets, activeTab, searchQuery]);

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="p-2 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-white/5 border-white/10"
          />
        </div>
      </div>

      {/* Category tabs - icons only */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetCategory)}>
        <TabsList className="w-full justify-center gap-1 p-1 bg-transparent border-b border-white/5 rounded-none">
          {(Object.keys(CATEGORY_ICONS) as AssetCategory[]).map((category) => {
            const Icon = CATEGORY_ICONS[category];
            return (
              <TabsTrigger
                key={category}
                value={category}
                className="p-2 rounded data-[state=active]:bg-white/10"
                title={CATEGORY_LABELS[category]}
              >
                <Icon className="w-4 h-4" />
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Assets list */}
        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {isLoadingAssets ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                Aucun élément trouvé
              </div>
            ) : (
              filteredAssets.map((asset) => (
                <AssetItem key={asset.id} asset={asset} />
              ))
            )}
          </div>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

// Individual asset item
function AssetItem({ asset }: { asset: MontageAsset }) {
  const { addClip, tracks, addTrack } = useMontageStore();
  const { signedUrl } = useSignedUrl(asset.thumbnailUrl || asset.url);

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData('application/json', JSON.stringify(asset));
      e.dataTransfer.effectAllowed = 'copy';
    },
    [asset]
  );

  // Handle double-click to add to timeline
  const handleDoubleClick = useCallback(() => {
    // Find appropriate track or create one
    const clipType: ClipType = asset.type === 'audio' ? 'audio' : 'video';
    const trackType = asset.type === 'audio' ? 'audio' : 'video';

    let targetTrack = tracks.find((t) => t.type === trackType);
    if (!targetTrack) {
      const trackId = addTrack(trackType);
      targetTrack = tracks.find((t) => t.id === trackId);
    }

    if (!targetTrack) return;

    // Calculate start position (end of last clip on track)
    const store = useMontageStore.getState();
    const trackClips = store.getClipsForTrack(targetTrack.id);
    const lastClip = trackClips[trackClips.length - 1];
    const startTime = lastClip ? lastClip.start + lastClip.duration : 0;

    // Add clip
    addClip({
      type: clipType,
      trackId: targetTrack.id,
      start: startTime,
      duration: asset.duration || 5, // Default 5s for images
      sourceDuration: asset.duration,
      assetId: asset.id,
      assetUrl: asset.url,
      thumbnailUrl: asset.thumbnailUrl,
      name: asset.name,
      color: asset.type === 'audio' ? '#22c55e' : '#8b5cf6',
      volume: 1,
    });
  }, [asset, tracks, addTrack, addClip]);

  // Format duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'group flex items-center gap-2 p-1.5 rounded-md cursor-grab',
        'hover:bg-white/5 active:cursor-grabbing',
        'transition-colors'
      )}
    >
      {/* Drag handle */}
      <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded overflow-hidden bg-slate-800 flex-shrink-0">
        {asset.type === 'audio' ? (
          <div className="w-full h-full flex items-center justify-center bg-green-900/30">
            <Music className="w-5 h-5 text-green-400" />
          </div>
        ) : signedUrl ? (
          <img
            src={signedUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-5 h-5 text-slate-600" />
          </div>
        )}

        {/* Duration badge */}
        {asset.duration && (
          <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/70 rounded text-[9px] text-white/80">
            {formatDuration(asset.duration)}
          </div>
        )}

        {/* Play icon overlay */}
        {(asset.type === 'rush' || asset.type === 'video') && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
            <Play className="w-4 h-4 text-white" fill="white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/90 truncate">{asset.name}</p>
        <p className="text-[10px] text-slate-500 truncate">
          {asset.type === 'rush' ? 'Rush' : asset.type}
          {asset.duration && ` • ${formatDuration(asset.duration)}`}
        </p>
      </div>

      {/* Add button */}
      <button
        onClick={handleDoubleClick}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
        title="Ajouter à la timeline"
      >
        <Plus className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </div>
  );
}
