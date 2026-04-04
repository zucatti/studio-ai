'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMontageStore, MontageAsset, ClipType } from '@/store/montage-store';
import { useShortsStore } from '@/store/shorts-store';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/use-signed-url';
import {
  Film,
  Image,
  Music,
  Layers,
  Search,
  GripVertical,
  Play,
  Plus,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Sequence } from '@/types/cinematic';

interface MontageSidebarProps {
  projectId: string;
  shortId: string;
  className?: string;
}

type AssetCategory = 'sequences' | 'videos' | 'images' | 'audio';

const CATEGORY_ICONS: Record<AssetCategory, typeof Film> = {
  sequences: Layers,
  videos: Film,
  images: Image,
  audio: Music,
};

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  sequences: 'Séquences',
  videos: 'Vidéos',
  images: 'Images',
  audio: 'Audio',
};

export function MontageSidebar({ projectId, shortId, className }: MontageSidebarProps) {
  const [activeTab, setActiveTab] = useState<AssetCategory>('sequences');
  const [searchQuery, setSearchQuery] = useState('');
  const { assets, setAssets, setLoadingAssets, isLoadingAssets } = useMontageStore();

  // Get short data from store (already loaded by parent page)
  const { getShortById, fetchShorts, isLoading: isShortsLoading } = useShortsStore();
  const short = getShortById(shortId);

  // Local loading states for each category
  const [isLoadingSequences, setIsLoadingSequences] = useState(false);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Sequences state (fetched separately since store might not have them)
  const [sequences, setSequences] = useState<Sequence[]>([]);

  // Fetch sequences from the short
  useEffect(() => {
    if (!shortId) return;

    const fetchSequences = async () => {
      setIsLoadingSequences(true);
      try {
        // Fetch sequences
        const seqRes = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences`);
        const seqData = seqRes.ok ? await seqRes.json() : { sequences: [] };
        const fetchedSequences: Sequence[] = seqData.sequences || [];
        setSequences(fetchedSequences);

        // Get plans from the short in the store
        const plans = short?.plans || [];

        // Create sequence assets
        const sequenceAssets: MontageAsset[] = [];

        for (const seq of fetchedSequences) {
          // Find plans in this sequence
          const seqPlans = plans.filter(p => p.sequence_id === seq.id);
          const totalDuration = seqPlans.reduce((sum, p) => sum + (p.duration || 0), 0);

          // Use assembled video if available, otherwise use first plan's video
          const videoUrl = seq.assembled_video_url || seqPlans.find(p => p.generated_video_url)?.generated_video_url;
          const thumbnailUrl = seqPlans[0]?.storyboard_image_url || seqPlans[0]?.generated_video_url;

          if (videoUrl || thumbnailUrl || seqPlans.length > 0) {
            sequenceAssets.push({
              id: seq.id,
              type: 'sequence',
              name: seq.title || `Séquence ${seq.sort_order + 1}`,
              url: videoUrl || '',
              thumbnailUrl: thumbnailUrl,
              duration: totalDuration,
              metadata: {
                planCount: seqPlans.length,
                hasAssembledVideo: !!seq.assembled_video_url,
              },
            });
          }
        }

        // Update store - merge with existing assets
        const currentAssets = useMontageStore.getState().assets;
        const filtered = currentAssets.filter(a => a.type !== 'sequence');
        setAssets([...filtered, ...sequenceAssets]);
      } catch (error) {
        console.error('[MontageSidebar] Failed to fetch sequences:', error);
      } finally {
        setIsLoadingSequences(false);
      }
    };

    fetchSequences();
  }, [projectId, shortId, short?.plans, setAssets]);

  // Helper to check if URL is a video
  const isVideoUrl = (url: string): boolean => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return (
      lower.includes('/videos/') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.webm') ||
      lower.endsWith('.mov') ||
      lower.endsWith('.avi')
    );
  };

  // Fetch videos from rush and plans
  useEffect(() => {
    const fetchVideos = async () => {
      setIsLoadingVideos(true);
      try {
        const videoAssets: MontageAsset[] = [];

        // 1. Get videos from rush (url can be image or video)
        const rushRes = await fetch(`/api/projects/${projectId}/rush`);
        const rushData = rushRes.ok ? await rushRes.json() : { images: [] };
        const rushImages = rushData.images || [];

        for (const rush of rushImages) {
          if (rush.url && isVideoUrl(rush.url)) {
            videoAssets.push({
              id: rush.id,
              type: 'rush',
              name: rush.prompt?.substring(0, 30) || 'Rush vidéo',
              url: rush.url,
              thumbnailUrl: rush.thumbnail_url,
              duration: rush.duration,
              metadata: { prompt: rush.prompt, source: 'rush' },
            });
          }
        }

        // 2. Get videos from all shorts plans
        const shortsRes = await fetch(`/api/projects/${projectId}/shorts`);
        const shortsData = shortsRes.ok ? await shortsRes.json() : { shorts: [] };
        const shorts = shortsData.shorts || [];

        for (const s of shorts) {
          const plans = s.plans || [];
          for (const plan of plans) {
            // Only include if has valid video URL and some metadata
            if (plan.generated_video_url && (plan.storyboard_image_url || plan.first_frame_url || plan.description)) {
              const name = plan.title || plan.description?.substring(0, 30) || `${s.title} - Plan ${plan.shot_number}`;
              videoAssets.push({
                id: plan.id,
                type: 'video',
                name,
                url: plan.generated_video_url,
                thumbnailUrl: plan.storyboard_image_url || plan.first_frame_url,
                duration: plan.duration,
                metadata: {
                  shortId: s.id,
                  shortTitle: s.title,
                  shotNumber: plan.shot_number,
                  source: 'plan',
                },
              });
            }
          }
        }

        // Update store
        const currentAssets = useMontageStore.getState().assets;
        const filtered = currentAssets.filter(a => a.type !== 'rush' && a.type !== 'video');
        setAssets([...filtered, ...videoAssets]);
      } catch (error) {
        console.error('[MontageSidebar] Failed to fetch videos:', error);
      } finally {
        setIsLoadingVideos(false);
      }
    };

    fetchVideos();
  }, [projectId, setAssets]);

  // Fetch images from gallery
  useEffect(() => {
    const fetchImages = async () => {
      setIsLoadingImages(true);
      try {
        const res = await fetch('/api/gallery');
        const data = res.ok ? await res.json() : { images: [] };

        // Filter to only this project's images
        const projectImages = (data.images || []).filter(
          (img: any) => img.projectId === projectId
        );

        const imageAssets: MontageAsset[] = projectImages.map((img: any) => ({
          id: img.id,
          type: img.type === 'storyboard' ? 'storyboard' : 'image',
          name: img.description?.substring(0, 30) || `Image ${img.shotNumber || ''}`,
          url: img.url,
          thumbnailUrl: img.url,
          metadata: {
            shotNumber: img.shotNumber,
            sceneNumber: img.sceneNumber,
            imageType: img.type,
          },
        }));

        // Update store
        const currentAssets = useMontageStore.getState().assets;
        const filtered = currentAssets.filter(a => a.type !== 'image' && a.type !== 'storyboard');
        setAssets([...filtered, ...imageAssets]);
      } catch (error) {
        console.error('[MontageSidebar] Failed to fetch images:', error);
      } finally {
        setIsLoadingImages(false);
      }
    };

    fetchImages();
  }, [projectId, setAssets]);

  // Fetch audio from project assets (Bible du projet)
  useEffect(() => {
    const fetchAudio = async () => {
      setIsLoadingAudio(true);
      try {
        // Fetch project-specific assets (linked via project_assets table)
        const res = await fetch(`/api/projects/${projectId}/assets`);
        const data = res.ok ? await res.json() : { assets: [] };

        const audioAssets: MontageAsset[] = [];

        (data.assets || []).forEach((asset: any) => {
          // Only include audio assets
          if (asset.asset_type === 'audio') {
            // Debug: log audio asset data
            console.log('[MontageSidebar] Audio asset:', asset.name, 'duration:', asset.data?.duration, 'data:', asset.data);

            audioAssets.push({
              id: asset.id,
              type: 'audio',
              name: asset.name,
              url: asset.data?.fileUrl || asset.data?.url || '',
              duration: asset.data?.duration || 0,
              metadata: {
                artist: asset.data?.artist,
                album: asset.data?.album,
              },
            });
          }
        });

        // Update store
        const currentAssets = useMontageStore.getState().assets;
        const filtered = currentAssets.filter(a => a.type !== 'audio');
        setAssets([...filtered, ...audioAssets]);
      } catch (error) {
        console.error('[MontageSidebar] Failed to fetch audio:', error);
      } finally {
        setIsLoadingAudio(false);
      }
    };

    fetchAudio();
  }, [projectId, setAssets]);

  // Get loading state for current tab
  const isLoading = useMemo(() => {
    switch (activeTab) {
      case 'sequences': return isLoadingSequences;
      case 'videos': return isLoadingVideos;
      case 'images': return isLoadingImages;
      case 'audio': return isLoadingAudio;
      default: return false;
    }
  }, [activeTab, isLoadingSequences, isLoadingVideos, isLoadingImages, isLoadingAudio]);

  // Filter assets by category and search
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Category filter
      let matches = false;
      switch (activeTab) {
        case 'sequences':
          matches = asset.type === 'sequence';
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

  // Get counts for each category
  const categoryCounts = useMemo(() => {
    return {
      sequences: assets.filter(a => a.type === 'sequence').length,
      videos: assets.filter(a => a.type === 'video' || a.type === 'rush').length,
      images: assets.filter(a => a.type === 'image' || a.type === 'storyboard').length,
      audio: assets.filter(a => a.type === 'audio').length,
    };
  }, [assets]);

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

      {/* Category tabs - icons only with counts */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AssetCategory)}>
        <TabsList className="w-full justify-center gap-1 p-1 bg-transparent border-b border-white/5 rounded-none">
          {(Object.keys(CATEGORY_ICONS) as AssetCategory[]).map((category) => {
            const Icon = CATEGORY_ICONS[category];
            const count = categoryCounts[category];
            return (
              <TabsTrigger
                key={category}
                value={category}
                className="relative p-2 rounded data-[state=active]:bg-white/10"
                title={`${CATEGORY_LABELS[category]} (${count})`}
              >
                <Icon className="w-4 h-4" />
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-purple-500 text-[9px] font-medium text-white">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Assets list */}
        <ScrollArea className="flex-1">
          <div className="p-1 space-y-0.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-500">
                <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs">
                {activeTab === 'sequences' && 'Aucune séquence'}
                {activeTab === 'videos' && 'Aucune vidéo'}
                {activeTab === 'images' && 'Aucune image'}
                {activeTab === 'audio' && 'Aucun audio'}
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
      color: asset.type === 'audio' ? '#22c55e' : asset.type === 'sequence' ? '#8b5cf6' : '#3b82f6',
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

  // Get icon for asset type
  const getIcon = () => {
    switch (asset.type) {
      case 'sequence': return Layers;
      case 'audio': return Music;
      case 'image':
      case 'storyboard': return Image;
      default: return Film;
    }
  };

  const Icon = getIcon();

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
            <Icon className="w-5 h-5 text-slate-600" />
          </div>
        )}

        {/* Duration badge */}
        {asset.duration && (
          <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 bg-black/70 rounded text-[9px] text-white/80">
            {formatDuration(asset.duration)}
          </div>
        )}

        {/* Sequence badge */}
        {asset.type === 'sequence' && (
          <div className="absolute top-0.5 left-0.5 px-1 py-0.5 bg-purple-500/80 rounded text-[8px] text-white font-medium">
            SEQ
          </div>
        )}

        {/* Play icon overlay */}
        {(asset.type === 'rush' || asset.type === 'video' || asset.type === 'sequence') && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
            <Play className="w-4 h-4 text-white" fill="white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/90 truncate">{asset.name}</p>
        <p className="text-[10px] text-slate-500 truncate">
          {asset.type === 'sequence' && `${(asset.metadata as any)?.planCount || 0} plans`}
          {asset.type === 'rush' && 'Rush'}
          {asset.type === 'video' && 'Vidéo'}
          {(asset.type === 'image' || asset.type === 'storyboard') && 'Image'}
          {asset.type === 'audio' && 'Audio'}
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
