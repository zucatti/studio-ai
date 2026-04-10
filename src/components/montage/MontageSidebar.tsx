'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Shuffle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Sequence } from '@/types/cinematic';

// Edition mode sequence/plan data
interface EditionSequence {
  id: string;
  title: string | null;
  start_time?: number | null;
  end_time?: number | null;
  assembled_video_url?: string | null;
}

interface EditionPlan {
  id: string;
  sequence_id: string | null;
  sort_order: number;
  duration: number;
  generated_video_url?: string | null;
  storyboard_image_url?: string | null;
  description?: string;
}

interface MontageSidebarProps {
  projectId: string;
  shortId: string;
  className?: string;
  // Edition mode data (for clip page)
  editionSequences?: EditionSequence[];
  editionPlans?: EditionPlan[];
}

type AssetCategory = 'sequences' | 'videos' | 'images' | 'audio' | 'transitions';

const CATEGORY_ICONS: Record<AssetCategory, typeof Film> = {
  sequences: Layers,
  videos: Film,
  images: Image,
  audio: Music,
  transitions: Shuffle,
};

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  sequences: 'Séquences',
  videos: 'Vidéos',
  images: 'Images',
  audio: 'Audio',
  transitions: 'Transitions',
};

// Transition types with metadata
import { TransitionType } from '@/store/montage-store';

interface TransitionInfo {
  type: TransitionType;
  label: string;
  category: string;
}

const TRANSITIONS: TransitionInfo[] = [
  // Basic
  { type: 'fade', label: 'Fondu', category: 'Basique' },
  { type: 'dissolve', label: 'Fondu enchaîné', category: 'Basique' },
  // Fade to color
  { type: 'fadeblack', label: 'Fondu au noir', category: 'Couleur' },
  { type: 'fadewhite', label: 'Fondu au blanc', category: 'Couleur' },
  // Directional
  { type: 'directional-left', label: 'Glissement gauche', category: 'Direction' },
  { type: 'directional-right', label: 'Glissement droite', category: 'Direction' },
  { type: 'directional-up', label: 'Glissement haut', category: 'Direction' },
  { type: 'directional-down', label: 'Glissement bas', category: 'Direction' },
  // Zoom
  { type: 'crosszoom', label: 'Zoom croisé', category: 'Zoom' },
  { type: 'zoomin', label: 'Zoom avant', category: 'Zoom' },
  { type: 'zoomout', label: 'Zoom arrière', category: 'Zoom' },
];

export function MontageSidebar({ projectId, shortId, className, editionSequences, editionPlans }: MontageSidebarProps) {
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

  // Fetch sequences from the short OR use edition props for clip mode
  useEffect(() => {
    const loadSequences = async () => {
      setIsLoadingSequences(true);
      try {
        let fetchedSequences: Sequence[] = [];
        let plans: { sequence_id?: string | null; duration?: number; generated_video_url?: string | null; storyboard_image_url?: string | null }[] = [];

        if (shortId) {
          // Short mode: fetch from API
          const seqRes = await fetch(`/api/projects/${projectId}/shorts/${shortId}/sequences`);
          const seqData = seqRes.ok ? await seqRes.json() : { sequences: [] };
          fetchedSequences = seqData.sequences || [];
          plans = short?.plans || [];
        } else if (editionSequences && editionSequences.length > 0) {
          // Clip mode: use props from Edition
          fetchedSequences = editionSequences.map((s, i) => ({
            id: s.id,
            title: s.title,
            sort_order: i,
            start_time: s.start_time,
            end_time: s.end_time,
            assembled_video_url: s.assembled_video_url,
          } as Sequence));
          plans = editionPlans || [];
          console.log('[MontageSidebar] Using edition sequences:', fetchedSequences.length, 'plans:', plans.length, 'with assembled URLs:', editionSequences.filter(s => s.assembled_video_url).length);
        } else {
          // Clip mode but no props: try to fetch from clip API
          try {
            const seqRes = await fetch(`/api/projects/${projectId}/clip/sequences`);
            const seqData = seqRes.ok ? await seqRes.json() : { sequences: [] };
            fetchedSequences = seqData.sequences || [];

            // Fetch plans for each sequence
            const allPlans: typeof plans = [];
            for (const seq of fetchedSequences) {
              const plansRes = await fetch(`/api/projects/${projectId}/sequences/${seq.id}/shots`);
              if (plansRes.ok) {
                const plansData = await plansRes.json();
                const seqPlans = (plansData.shots || []).map((shot: any) => ({
                  ...shot,
                  sequence_id: seq.id,
                }));
                allPlans.push(...seqPlans);
              }
            }
            plans = allPlans;
            console.log('[MontageSidebar] Fetched clip sequences:', fetchedSequences.length, 'plans:', plans.length);
          } catch (e) {
            console.error('[MontageSidebar] Failed to fetch clip sequences:', e);
          }
        }

        setSequences(fetchedSequences);

        // Create sequence assets
        const sequenceAssets: MontageAsset[] = [];

        for (const seq of fetchedSequences) {
          // Find plans in this sequence
          const seqPlans = plans.filter(p => p.sequence_id === seq.id);
          const totalDuration = seqPlans.reduce((sum, p) => sum + (p.duration || 0), 0);

          // ONLY use assembled video for sequences - don't fallback to individual plans!
          const assembledVideoUrl = (seq as any).assembled_video_url;
          const thumbnailUrl = seqPlans[0]?.storyboard_image_url || seqPlans[0]?.generated_video_url;

          if (assembledVideoUrl || thumbnailUrl || seqPlans.length > 0) {
            sequenceAssets.push({
              id: seq.id,
              type: 'sequence',
              name: seq.title || `Séquence ${(seq.sort_order ?? 0) + 1}`,
              url: assembledVideoUrl || '', // Only assembled video, empty if not assembled
              thumbnailUrl: thumbnailUrl ?? undefined,
              duration: totalDuration,
              metadata: {
                planCount: seqPlans.length,
                hasAssembledVideo: !!assembledVideoUrl,
              },
            });
          }
        }

        // Update store - merge with existing assets
        const currentAssets = useMontageStore.getState().assets;
        const filtered = currentAssets.filter(a => a.type !== 'sequence');
        setAssets([...filtered, ...sequenceAssets]);
        console.log('[MontageSidebar] Loaded sequence assets:', sequenceAssets.length);
      } catch (error) {
        console.error('[MontageSidebar] Failed to fetch sequences:', error);
      } finally {
        setIsLoadingSequences(false);
      }
    };

    loadSequences();
  }, [projectId, shortId, short?.plans, editionSequences, editionPlans, setAssets]);

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
          // Only include valid rush videos with thumbnails and meaningful names
          const hasValidUrl = rush.url && isVideoUrl(rush.url);
          const hasThumbnail = rush.thumbnail_url && rush.thumbnail_url.length > 0;
          const hasValidName = rush.prompt &&
            rush.prompt.trim().length > 0 &&
            !rush.prompt.toLowerCase().includes('video generation');

          if (hasValidUrl && (hasThumbnail || hasValidName)) {
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
        console.log('[MontageSidebar] Loaded video assets:', videoAssets.length, 'sample:', videoAssets[0] ? {
          id: videoAssets[0].id,
          url: videoAssets[0].url?.substring(0, 50),
          thumbnailUrl: videoAssets[0].thumbnailUrl?.substring(0, 50),
        } : null);
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

  // Helper to get audio duration from URL
  const getAudioDuration = async (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration || 0);
      });
      audio.addEventListener('error', () => {
        resolve(0);
      });
      // Set a timeout in case the audio never loads
      setTimeout(() => resolve(0), 5000);
      audio.src = url;
    });
  };

  // Fetch audio from project assets (Bible du projet)
  useEffect(() => {
    const fetchAudio = async () => {
      setIsLoadingAudio(true);
      try {
        // Fetch project-specific assets (linked via project_assets table)
        const res = await fetch(`/api/projects/${projectId}/assets`);
        const data = res.ok ? await res.json() : { assets: [] };

        const audioAssets: MontageAsset[] = [];

        for (const asset of data.assets || []) {
          // Only include audio assets
          if (asset.asset_type === 'audio') {
            let duration = asset.data?.duration || 0;
            const fileUrl = asset.data?.fileUrl || asset.data?.url || '';

            // If duration is 0, try to load the audio to get the real duration
            if (duration === 0 && fileUrl) {
              // Sign the URL first if it's a B2 URL
              let signedUrl = fileUrl;
              if (fileUrl.startsWith('b2://')) {
                try {
                  const signRes = await fetch('/api/storage/sign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ urls: [fileUrl] }),
                  });
                  if (signRes.ok) {
                    const signData = await signRes.json();
                    signedUrl = signData.signedUrls?.[fileUrl] || fileUrl;
                  }
                } catch (e) {
                  console.error('[MontageSidebar] Failed to sign audio URL:', e);
                }
              }

              // Get duration from audio element
              duration = await getAudioDuration(signedUrl);
              console.log('[MontageSidebar] Loaded audio duration:', asset.name, duration);
            }

            audioAssets.push({
              id: asset.id,
              type: 'audio',
              name: asset.name,
              url: fileUrl,
              duration,
              metadata: {
                artist: asset.data?.artist,
                album: asset.data?.album,
              },
            });
          }
        }

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
      transitions: TRANSITIONS.length,
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
            {activeTab === 'transitions' ? (
              // Transitions list
              <div className="space-y-0.5">
                {TRANSITIONS.map((transition) => (
                  <TransitionItem key={transition.type} transition={transition} />
                ))}
              </div>
            ) : isLoading ? (
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

// Check if URL is a video file
function isVideoFile(url: string | null | undefined): boolean {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('/videos/');
}

// Video thumbnail component - uses video element to show first frame
function VideoThumbnail({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      video.currentTime = 0.1; // Seek to show first frame
    };

    video.addEventListener('loadeddata', handleLoadedData);
    return () => video.removeEventListener('loadeddata', handleLoadedData);
  }, [src]);

  return (
    <video
      ref={videoRef}
      src={src}
      className="w-full h-full object-cover"
      muted
      playsInline
      preload="metadata"
    />
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
          isVideoFile(signedUrl) ? (
            <VideoThumbnail src={signedUrl} />
          ) : (
            <img
              src={signedUrl}
              alt={asset.name}
              className="w-full h-full object-cover"
            />
          )
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

// Transition item with animated preview
function TransitionItem({ transition }: { transition: TransitionInfo }) {
  const { addClip, tracks, addTrack } = useMontageStore();
  const [isHovered, setIsHovered] = useState(false);

  // Handle drag start
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const data = {
        type: 'transition',
        transitionType: transition.type,
        name: transition.label,
        duration: 0.5, // Default transition duration
      };
      e.dataTransfer.setData('application/json', JSON.stringify(data));
      e.dataTransfer.effectAllowed = 'copy';
    },
    [transition]
  );

  // Handle double-click to add to timeline
  const handleDoubleClick = useCallback(() => {
    // Find or create transition track
    let targetTrack = tracks.find((t) => t.type === 'transition');
    if (!targetTrack) {
      const trackId = addTrack('transition', 'Transitions');
      targetTrack = useMontageStore.getState().tracks.find((t) => t.id === trackId);
    }

    if (!targetTrack) return;

    // Calculate start position (at playhead)
    const store = useMontageStore.getState();
    const startTime = store.currentTime || 0;

    // Add transition clip on the transition track
    addClip({
      type: 'transition',
      trackId: targetTrack.id,
      start: startTime,
      duration: 0.5, // Default 0.5s
      name: transition.label,
      transitionType: transition.type,
      color: '#f97316', // Orange for transitions
    });
  }, [transition, tracks, addTrack, addClip]);

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group flex items-center gap-2 p-1.5 rounded-md cursor-grab',
        'hover:bg-white/5 active:cursor-grabbing',
        'transition-colors'
      )}
    >
      {/* Drag handle */}
      <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Animated preview */}
      <div className="relative w-12 h-12 rounded overflow-hidden bg-slate-900 flex-shrink-0">
        <TransitionPreview type={transition.type} isPlaying={isHovered} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/90 truncate">{transition.label}</p>
        <p className="text-[10px] text-slate-500 truncate">{transition.category}</p>
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

// Animated transition preview component
function TransitionPreview({ type, isPlaying }: { type: TransitionType; isPlaying: boolean }) {
  // CSS animations for each transition type
  const getAnimationStyles = (): { left: React.CSSProperties; right: React.CSSProperties } => {
    const baseLeft: React.CSSProperties = {
      position: 'absolute',
      width: '100%',
      height: '100%',
      backgroundColor: '#3b82f6', // Blue
      transition: 'none',
    };
    const baseRight: React.CSSProperties = {
      position: 'absolute',
      width: '100%',
      height: '100%',
      backgroundColor: '#8b5cf6', // Purple
      transition: 'none',
    };

    if (!isPlaying) {
      // Static: show split view
      return {
        left: { ...baseLeft, clipPath: 'inset(0 50% 0 0)' },
        right: { ...baseRight, clipPath: 'inset(0 0 0 50%)' },
      };
    }

    // Playing animations
    const duration = '1.5s';
    const timing = 'ease-in-out';
    const iterationCount = 'infinite';

    switch (type) {
      case 'fade':
      case 'dissolve':
        return {
          left: {
            ...baseLeft,
            animation: `fadeOut ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `fadeIn ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'fadeblack':
        return {
          left: {
            ...baseLeft,
            animation: `fadeOut ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            backgroundColor: '#000',
            animation: `fadeBlackIn ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'fadewhite':
        return {
          left: {
            ...baseLeft,
            animation: `fadeOut ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            backgroundColor: '#fff',
            animation: `fadeWhiteIn ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'directional-left':
        return {
          left: {
            ...baseLeft,
            animation: `slideOutLeft ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `slideInLeft ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'directional-right':
        return {
          left: {
            ...baseLeft,
            animation: `slideOutRight ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `slideInRight ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'directional-up':
        return {
          left: {
            ...baseLeft,
            animation: `slideOutUp ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `slideInUp ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'directional-down':
        return {
          left: {
            ...baseLeft,
            animation: `slideOutDown ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `slideInDown ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'crosszoom':
        return {
          left: {
            ...baseLeft,
            animation: `zoomOut ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `zoomIn ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'zoomin':
        return {
          left: {
            ...baseLeft,
            animation: `zoomOutFade ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `zoomInFade ${duration} ${timing} ${iterationCount}`,
          },
        };

      case 'zoomout':
        return {
          left: {
            ...baseLeft,
            animation: `zoomInReverse ${duration} ${timing} ${iterationCount}`,
          },
          right: {
            ...baseRight,
            animation: `zoomOutReverse ${duration} ${timing} ${iterationCount}`,
          },
        };

      default:
        return {
          left: { ...baseLeft, clipPath: 'inset(0 50% 0 0)' },
          right: { ...baseRight, clipPath: 'inset(0 0 0 50%)' },
        };
    }
  };

  const styles = getAnimationStyles();

  return (
    <>
      {/* CSS Keyframes */}
      <style jsx>{`
        @keyframes fadeOut {
          0%, 30% { opacity: 1; }
          70%, 100% { opacity: 0; }
        }
        @keyframes fadeIn {
          0%, 30% { opacity: 0; }
          70%, 100% { opacity: 1; }
        }
        @keyframes fadeBlackIn {
          0% { opacity: 0; background-color: #000; }
          40% { opacity: 1; background-color: #000; }
          60% { opacity: 1; background-color: #000; }
          100% { opacity: 1; background-color: #8b5cf6; }
        }
        @keyframes fadeWhiteIn {
          0% { opacity: 0; background-color: #fff; }
          40% { opacity: 1; background-color: #fff; }
          60% { opacity: 1; background-color: #fff; }
          100% { opacity: 1; background-color: #8b5cf6; }
        }
        @keyframes slideOutLeft {
          0%, 20% { transform: translateX(0); }
          80%, 100% { transform: translateX(-100%); }
        }
        @keyframes slideInLeft {
          0%, 20% { transform: translateX(100%); }
          80%, 100% { transform: translateX(0); }
        }
        @keyframes slideOutRight {
          0%, 20% { transform: translateX(0); }
          80%, 100% { transform: translateX(100%); }
        }
        @keyframes slideInRight {
          0%, 20% { transform: translateX(-100%); }
          80%, 100% { transform: translateX(0); }
        }
        @keyframes slideOutUp {
          0%, 20% { transform: translateY(0); }
          80%, 100% { transform: translateY(-100%); }
        }
        @keyframes slideInUp {
          0%, 20% { transform: translateY(100%); }
          80%, 100% { transform: translateY(0); }
        }
        @keyframes slideOutDown {
          0%, 20% { transform: translateY(0); }
          80%, 100% { transform: translateY(100%); }
        }
        @keyframes slideInDown {
          0%, 20% { transform: translateY(-100%); }
          80%, 100% { transform: translateY(0); }
        }
        @keyframes zoomOut {
          0%, 20% { transform: scale(1); opacity: 1; }
          80%, 100% { transform: scale(0.5); opacity: 0; }
        }
        @keyframes zoomIn {
          0%, 20% { transform: scale(1.5); opacity: 0; }
          80%, 100% { transform: scale(1); opacity: 1; }
        }
        @keyframes zoomOutFade {
          0%, 20% { transform: scale(1); opacity: 1; }
          80%, 100% { transform: scale(0.8); opacity: 0; }
        }
        @keyframes zoomInFade {
          0%, 20% { transform: scale(1.2); opacity: 0; }
          80%, 100% { transform: scale(1); opacity: 1; }
        }
        @keyframes zoomInReverse {
          0%, 20% { transform: scale(1); opacity: 1; }
          80%, 100% { transform: scale(1.2); opacity: 0; }
        }
        @keyframes zoomOutReverse {
          0%, 20% { transform: scale(0.8); opacity: 0; }
          80%, 100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div style={styles.left} />
      <div style={styles.right} />
    </>
  );
}
