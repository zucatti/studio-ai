'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MentionInput } from '@/components/ui/mention-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { StorageImg } from '@/components/ui/storage-image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DurationPicker } from './DurationPicker';
import { GalleryPicker } from '@/components/gallery/GalleryPicker';
import { VideoGenerationCard, type VideoGenerationProgress } from './VideoGenerationCard';
import { Loader2, ImageIcon, Film, Play, Pause, Mic, Images, Video, Link, Maximize2, Volume2, VolumeX, Download, X, Clock, Settings, Music, ChevronDown, Sparkles } from 'lucide-react';
import { useBibleStore } from '@/store/bible-store';
import type { Plan } from '@/store/shorts-store';
import type { ShotType, CameraAngle, CameraMovement, AspectRatio } from '@/types/database';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  VideoProvider,
  VIDEO_PROVIDER_MODELS,
  PROVIDER_INFO,
  DIALOGUE_VIDEO_MODELS,
  modelSupportsFrameOut,
} from '@/lib/ai/video-provider';

// Shot types
const SHOT_TYPES: { value: ShotType; label: string }[] = [
  { value: 'wide', label: 'Plan large' },
  { value: 'medium', label: 'Plan moyen' },
  { value: 'close_up', label: 'Gros plan' },
  { value: 'extreme_close_up', label: 'Très gros plan' },
  { value: 'over_shoulder', label: 'Par-dessus épaule' },
  { value: 'pov', label: 'Point de vue' },
];

// Camera angles
const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'eye_level', label: 'Niveau des yeux' },
  { value: 'low_angle', label: 'Contre-plongée' },
  { value: 'high_angle', label: 'Plongée' },
  { value: 'dutch_angle', label: 'Angle hollandais' },
  { value: 'birds_eye', label: 'Vue aérienne' },
  { value: 'worms_eye', label: 'Contre-plongée extrême' },
];

// Camera movements
const CAMERA_MOVEMENTS: { value: CameraMovement; label: string }[] = [
  { value: 'static', label: 'Statique' },
  { value: 'slow_dolly_in', label: 'Dolly in lent' },
  { value: 'slow_dolly_out', label: 'Dolly out lent' },
  { value: 'tracking_forward', label: 'Travelling avant' },
  { value: 'tracking_backward', label: 'Travelling arrière' },
  { value: 'orbit_180', label: 'Orbite 180°' },
  { value: 'handheld', label: 'Caméra à l\'épaule' },
  { value: 'smooth_zoom_in', label: 'Zoom in doux' },
  { value: 'smooth_zoom_out', label: 'Zoom out doux' },
];

// Aspect ratio dimensions for preview
const ASPECT_RATIO_CONFIG: Record<AspectRatio, { width: number; height: number; label: string; isPortrait: boolean }> = {
  '9:16': { width: 9, height: 16, label: 'Vertical', isPortrait: true },
  '16:9': { width: 16, height: 9, label: 'Horizontal', isPortrait: false },
  '1:1': { width: 1, height: 1, label: 'Carré', isPortrait: false },
  '4:5': { width: 4, height: 5, label: 'Portrait', isPortrait: true },
  '2:3': { width: 2, height: 3, label: 'Photo', isPortrait: true },
  '21:9': { width: 21, height: 9, label: 'Cinéma', isPortrait: false },
};

interface PlanEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: Plan | null;
  previousPlan?: Plan | null;  // Plan précédent pour la continuité
  projectId: string;
  aspectRatio: AspectRatio;
  onUpdate: (updates: Partial<Plan>) => void;
  onGenerateVideo: (planId: string, options: VideoGenerationOptions) => Promise<void>;
  isGeneratingVideo: boolean;
  videoGenerationProgress?: VideoGenerationProgress | null;
}

export interface VideoGenerationOptions {
  videoModel: string;
  duration: number;
  videoProvider: VideoProvider;
}

export function PlanEditorModal({
  open,
  onOpenChange,
  plan,
  previousPlan,
  projectId,
  aspectRatio,
  onUpdate,
  onGenerateVideo,
  isGeneratingVideo,
  videoGenerationProgress,
}: PlanEditorModalProps) {
  // Animation prompt (applies to both frames)
  const [animationPrompt, setAnimationPrompt] = useState('');

  // Dialogue settings
  const [hasDialogue, setHasDialogue] = useState(false);
  const [dialogueText, setDialogueText] = useState('');
  const [dialogueCharacterId, setDialogueCharacterId] = useState<string | null>(null);

  // Audio/Music mode
  const [audioMode, setAudioMode] = useState<'mute' | 'dialogue' | 'audio' | 'instrumental' | 'vocal'>('mute');
  const [selectedAudioAssetId, setSelectedAudioAssetId] = useState<string | null>(null);
  const [audioStart, setAudioStart] = useState(0);
  const [audioEnd, setAudioEnd] = useState<number | null>(null);
  const [audioWaveform, setAudioWaveform] = useState<number[]>([]);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const musicPlayerRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicCurrentTime, setMusicCurrentTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);

  // Gallery picker state
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [pickingFrame, setPickingFrame] = useState<'in' | 'out' | null>(null);

  // Video generation settings
  const [videoProvider, setVideoProvider] = useState<VideoProvider>('fal');
  const [videoModel, setVideoModel] = useState('kling-omni');
  const [showAdvancedVideo, setShowAdvancedVideo] = useState(false); // Hidden by default

  // Cinematic shot details (for mega-prompt mode)
  const [showCinematicDetails, setShowCinematicDetails] = useState(false);
  const [shotSubject, setShotSubject] = useState('');
  const [framing, setFraming] = useState('');
  const [action, setAction] = useState('');
  const [environment, setEnvironment] = useState('');
  const [dialogueTone, setDialogueTone] = useState('');

  // Get appropriate video models based on provider and dialogue state
  const availableVideoModels = useMemo(() => {
    if (hasDialogue) {
      // When dialogue is enabled, only show dialogue-specific models
      return DIALOGUE_VIDEO_MODELS;
    }
    return VIDEO_PROVIDER_MODELS[videoProvider];
  }, [hasDialogue, videoProvider]);

  // Auto-switch model when dialogue is toggled
  useEffect(() => {
    if (hasDialogue) {
      // Set default dialogue model if current model is not a dialogue model
      const isDialogueModel = DIALOGUE_VIDEO_MODELS.some(m => m.value === videoModel);
      if (!isDialogueModel) {
        const defaultModel = DIALOGUE_VIDEO_MODELS[0];
        setVideoModel(defaultModel.value);
        setVideoProvider(defaultModel.provider);
      }
    }
  }, [hasDialogue, videoModel]);

  // Auto-switch provider when dialogue model changes
  useEffect(() => {
    if (hasDialogue) {
      const dialogueModel = DIALOGUE_VIDEO_MODELS.find(m => m.value === videoModel);
      if (dialogueModel && dialogueModel.provider !== videoProvider) {
        setVideoProvider(dialogueModel.provider);
      }
    }
  }, [hasDialogue, videoModel, videoProvider]);

  // Auto-switch video model when provider changes (non-dialogue mode)
  useEffect(() => {
    if (hasDialogue) return; // Skip in dialogue mode
    const providerModels = VIDEO_PROVIDER_MODELS[videoProvider];
    if (providerModels.length > 0 && !providerModels.find(m => m.value === videoModel)) {
      setVideoModel(providerModels[0].value);
    }
  }, [videoProvider, videoModel, hasDialogue]);

  // Check if current model supports Frame Out
  const showFrameOut = !hasDialogue || modelSupportsFrameOut(videoModel);

  // Hover states
  const [hoveredFrame, setHoveredFrame] = useState<'in' | 'out' | null>(null);

  // Video preview mode (when video is generated)
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  // Audio generation state
  const [isAddingAudio, setIsAddingAudio] = useState(false);

  // Custom video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { projectAssets, fetchProjectAssets } = useBibleStore();

  // Fetch project assets for mentions
  useEffect(() => {
    fetchProjectAssets(projectId);
  }, [projectId, fetchProjectAssets]);

  // Sync state with plan on modal open
  useEffect(() => {
    if (plan) {
      // Use animation_prompt if available, fall back to description
      setAnimationPrompt(plan.animation_prompt || plan.description || '');
      setHasDialogue(plan.has_dialogue ?? false);
      setDialogueText(plan.dialogue_text ?? '');
      setDialogueCharacterId(plan.dialogue_character_id ?? null);
      setAudioMode(plan.audio_mode || 'mute');
      setSelectedAudioAssetId(plan.audio_asset_id || null);
      setAudioStart(plan.audio_start ?? 0);
      setAudioEnd(plan.audio_end ?? null);
      // Auto-show video preview if video exists
      setShowVideoPreview(!!plan.generated_video_url);
      // Cinematic shot details
      setShotSubject(plan.shot_subject || '');
      setFraming(plan.framing || '');
      setAction(plan.action || '');
      setEnvironment(plan.environment || '');
      setDialogueTone(plan.dialogue_tone || '');
      // Auto-expand cinematic details if any are filled
      setShowCinematicDetails(!!(plan.shot_subject || plan.framing || plan.action || plan.environment || plan.dialogue_tone));
    }
    // Only sync on modal open (plan id change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  // Auto-switch to video preview when video is generated or when generating
  useEffect(() => {
    if (plan?.generated_video_url && !isGeneratingVideo) {
      setShowVideoPreview(true);
    }
  }, [plan?.generated_video_url, isGeneratingVideo]);

  // Auto-switch to video tab when generation starts
  useEffect(() => {
    if (videoGenerationProgress && videoGenerationProgress.status === 'generating') {
      setShowVideoPreview(true);
    }
  }, [videoGenerationProgress]);

  // Reset video state when switching to video preview
  useEffect(() => {
    if (showVideoPreview) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [showVideoPreview]);

  // Handle ESC key for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Get characters for dialogue picker
  const dialogueCharacters = useMemo(() => {
    return projectAssets
      .filter((asset) => asset.asset_type === 'character')
      .map((asset) => {
        const data = asset.data as Record<string, unknown> | null;
        return {
          id: asset.id,
          name: asset.name,
          voice_id: (data?.voice_id as string) || null,
        };
      });
  }, [projectAssets]);

  // Get music assets for audio picker (only 'music' type)
  const musicAssets = useMemo(() => {
    return projectAssets
      .filter((asset) => {
        if (asset.asset_type !== 'audio') return false;
        const data = asset.data as Record<string, unknown> | null;
        return data?.audioType === 'music';
      })
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        data: asset.data as Record<string, unknown>,
      }));
  }, [projectAssets]);

  // Get selected music asset
  const selectedMusicAsset = useMemo(() => {
    return musicAssets.find(a => a.id === selectedAudioAssetId);
  }, [musicAssets, selectedAudioAssetId]);

  // The audio selection duration is locked to the plan duration
  const selectionDuration = plan?.duration || 5;

  // Generate waveform when audio is selected (uses stored duration, simulates waveform)
  const generateWaveform = useCallback((audioUrl: string, duration?: number) => {
    setIsLoadingWaveform(true);

    // Use provided duration or default
    const audioDuration = duration || 180; // Default 3 min if unknown
    setMusicDuration(audioDuration);

    // The effective selection duration is the min of plan duration and music duration
    const effectiveSelectionDuration = Math.min(audioDuration, selectionDuration);

    // Initialize or clamp selection to valid range
    const currentEnd = audioEnd ?? 0;
    if (currentEnd === 0 || audioStart + effectiveSelectionDuration > audioDuration) {
      // Reset to start if invalid
      setAudioStart(0);
      setAudioEnd(effectiveSelectionDuration);
    }

    // Generate aesthetic waveform pattern (simulated but consistent)
    // Use a seed based on the URL to make it consistent for the same file
    const seed = audioUrl.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const waveformData: number[] = [];
    for (let i = 0; i < 100; i++) {
      // Create a musical-looking pattern with some randomness
      const base = Math.sin(i * 0.15 + seed * 0.01) * 0.3 + 0.5;
      const variation = Math.sin(i * 0.4 + seed * 0.02) * 0.2;
      const noise = Math.sin(seed + i * 7.3) * 0.15;
      waveformData.push(Math.max(0.1, Math.min(1, base + variation + noise)));
    }

    setAudioWaveform(waveformData);
    setIsLoadingWaveform(false);
  }, [audioEnd, audioStart, selectionDuration]);

  // Load waveform when audio is selected
  useEffect(() => {
    if (selectedMusicAsset) {
      const data = selectedMusicAsset.data as { fileUrl?: string; duration?: number };
      if (data.fileUrl) {
        generateWaveform(data.fileUrl, data.duration);
      }
    } else {
      setAudioWaveform([]);
      setMusicDuration(0);
    }
  }, [selectedMusicAsset, generateWaveform]);

  // Music player controls
  const toggleMusicPlay = useCallback(async () => {
    if (!selectedMusicAsset) return;
    const fileUrl = (selectedMusicAsset.data as { fileUrl?: string })?.fileUrl;
    if (!fileUrl) return;

    if (isMusicPlaying && musicPlayerRef.current) {
      musicPlayerRef.current.pause();
      setIsMusicPlaying(false);
      return;
    }

    // Get signed URL
    let signedUrl = fileUrl;
    if (fileUrl.startsWith('b2://')) {
      const res = await fetch('/api/storage/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [fileUrl] }),
      });
      if (res.ok) {
        const data = await res.json();
        signedUrl = data.signedUrls?.[fileUrl] || fileUrl;
      }
    }

    if (!musicPlayerRef.current || musicPlayerRef.current.src !== signedUrl) {
      musicPlayerRef.current = new Audio(signedUrl);
      musicPlayerRef.current.ontimeupdate = () => {
        if (musicPlayerRef.current) {
          setMusicCurrentTime(musicPlayerRef.current.currentTime);
          // Stop at audioEnd
          if (audioEnd && musicPlayerRef.current.currentTime >= audioEnd) {
            musicPlayerRef.current.pause();
            musicPlayerRef.current.currentTime = audioStart;
            setIsMusicPlaying(false);
          }
        }
      };
      musicPlayerRef.current.onended = () => setIsMusicPlaying(false);
    }

    musicPlayerRef.current.currentTime = audioStart;
    await musicPlayerRef.current.play();
    setIsMusicPlaying(true);
  }, [selectedMusicAsset, isMusicPlaying, audioStart, audioEnd]);

  // Cleanup music player on unmount
  useEffect(() => {
    return () => {
      if (musicPlayerRef.current) {
        musicPlayerRef.current.pause();
        musicPlayerRef.current = null;
      }
    };
  }, []);

  const ratioConfig = ASPECT_RATIO_CONFIG[aspectRatio] || ASPECT_RATIO_CONFIG['9:16'];

  // Video player controls
  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

  const handleVideoTimeUpdate = useCallback(() => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  }, []);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
  }, []);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const time = parseFloat(e.target.value);
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const openFullscreen = useCallback(() => {
    // Pause current video before opening fullscreen
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setIsFullscreen(true);
  }, []);

  const closeFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  // Download video (via hidden iframe to force download)
  const handleDownloadVideo = useCallback(() => {
    if (!plan?.generated_video_url) return;

    const filename = `plan-${plan.shot_number}-video.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(plan.generated_video_url)}&filename=${encodeURIComponent(filename)}`;

    // Use hidden iframe to trigger download without navigating
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    // Cleanup after download starts
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 5000);

    toast.success('Téléchargement démarré');
  }, [plan?.generated_video_url, plan?.shot_number]);

  // Download frame image (via hidden iframe to force download)
  const handleDownloadFrame = useCallback((type: 'in' | 'out') => {
    const url = type === 'in' ? plan?.storyboard_image_url : plan?.last_frame_url;
    if (!url) return;

    // Get extension from URL (default to png since we now extract in PNG)
    const urlPath = url.split('?')[0]; // Remove query params
    const ext = urlPath.match(/\.(png|jpg|jpeg|webp)$/i)?.[1] || 'png';
    const filename = `plan-${plan?.shot_number}-frame-${type}.${ext}`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);

    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 5000);

    toast.success('Téléchargement démarré');
  }, [plan?.storyboard_image_url, plan?.last_frame_url, plan?.shot_number]);

  // Format time for display
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Format time for audio (with decimals for precision)
  const formatTimeAudio = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // Calculate frame preview dimensions - fill available height
  const getFrameStyle = () => {
    // Use most of the available height (90vh modal - header ~100px - padding)
    const maxFrameHeight = 550;
    const ratio = ratioConfig.width / ratioConfig.height;
    const height = maxFrameHeight;
    const width = height * ratio;
    return { width, height };
  };

  const frameStyle = getFrameStyle();

  // State for extracting frame from video
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);

  // Get the previous plan's linkable content
  // Priority: 1. Extract from video, 2. last_frame_url, 3. first_frame_url
  const previousVideoUrl = previousPlan?.generated_video_url;
  const previousLastFrameUrl = previousPlan?.last_frame_url;
  const previousFirstFrameUrl = previousPlan?.storyboard_image_url || previousPlan?.first_frame_url;
  const hasPreviousFrame = !!previousVideoUrl || !!previousLastFrameUrl || !!previousFirstFrameUrl;
  const willExtractFromVideo = !!previousVideoUrl;

  // Copy previous plan's last frame to current plan's first frame
  // Uses server-side FFmpeg for reliable frame extraction
  const copyFromPreviousPlan = useCallback(async () => {
    // 1. If video exists, extract the real last frame using FFmpeg API
    if (previousVideoUrl) {
      setIsExtractingFrame(true);
      try {
        toast.loading('Extraction de la dernière frame (FFmpeg)...', { id: 'extract-frame' });

        const response = await fetch(`/api/projects/${projectId}/extract-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: previousVideoUrl,
            position: 'last',
            outputFormat: 'png',  // Lossless for best continuity
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to extract frame');
        }

        const { frameUrl } = await response.json();

        onUpdate({ storyboard_image_url: frameUrl, first_frame_url: frameUrl });
        toast.success('Dernière frame extraite avec FFmpeg!', { id: 'extract-frame' });
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('FFmpeg frame extraction failed:', errorMsg);
        toast.error(`Extraction FFmpeg échouée: ${errorMsg}`, { id: 'extract-frame' });
        // Fall through to fallbacks
      } finally {
        setIsExtractingFrame(false);
      }
    }

    // 2. Use last_frame_url if available
    if (previousLastFrameUrl) {
      onUpdate({ storyboard_image_url: previousLastFrameUrl, first_frame_url: previousLastFrameUrl });
      toast.success('Dernière frame liée!');
      return;
    }

    // 3. Fallback: use first frame
    if (previousFirstFrameUrl) {
      onUpdate({ storyboard_image_url: previousFirstFrameUrl, first_frame_url: previousFirstFrameUrl });
      toast.warning('Première frame utilisée (pas de dernière frame)');
      return;
    }

    toast.error('Aucune frame disponible');
  }, [previousVideoUrl, previousLastFrameUrl, previousFirstFrameUrl, projectId, onUpdate]);

  if (!plan) return null;

  // Handle animation prompt change
  const handleAnimationPromptChange = (value: string) => {
    setAnimationPrompt(value);
    onUpdate({ animation_prompt: value });
  };

  const handleGenerateVideo = async () => {
    if (!plan.storyboard_image_url) {
      toast.error('Générez d\'abord la Frame In');
      return;
    }
    await onGenerateVideo(plan.id, { videoModel, duration: plan.duration, videoProvider });
    toast.success(`Vidéo en cours de génération via ${PROVIDER_INFO[videoProvider].name}...`);
  };

  // Add audio to existing video (separate step for debugging)
  const handleAddAudio = async () => {
    if (!plan.generated_video_url) {
      toast.error('Générez d\'abord la vidéo');
      return;
    }
    if (!hasDialogue || !dialogueText) {
      toast.error('Activez le dialogue et ajoutez du texte');
      return;
    }
    if (!dialogueCharacterId) {
      toast.error('Sélectionnez un personnage pour le dialogue');
      return;
    }

    setIsAddingAudio(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/shots/${plan.id}/add-audio`, {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add audio');
      }

      toast.success('Audio ajouté avec succès!');
      // Refresh the plan to get new video URL
      window.location.reload();
    } catch (error) {
      console.error('Add audio error:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'ajout audio');
    } finally {
      setIsAddingAudio(false);
    }
  };

  const hasFrameIn = !!plan.storyboard_image_url;
  const canGenerateVideo = hasFrameIn; // Frame Out is optional

  // Handle selecting image from gallery
  const handleImageSelect = (url: string) => {
    if (pickingFrame === 'in') {
      onUpdate({ storyboard_image_url: url, first_frame_url: url });
    } else if (pickingFrame === 'out') {
      onUpdate({ last_frame_url: url });
    }
    setShowGalleryPicker(false);
    setPickingFrame(null);
    toast.success(`Frame ${pickingFrame === 'in' ? 'In' : 'Out'} selectionnee`);
  };

  // Open gallery picker for a frame
  const openGalleryPicker = (frameType: 'in' | 'out') => {
    setPickingFrame(frameType);
    setShowGalleryPicker(true);
  };

  // Render a frame (no click-to-select, only hover actions)
  const renderFrame = (type: 'in' | 'out') => {
    const imageUrl = type === 'in' ? plan.storyboard_image_url : plan.last_frame_url;
    const hasImage = !!imageUrl;
    const isHovered = hoveredFrame === type;
    const label = type === 'in' ? 'Frame In' : 'Frame Out';
    const borderColorDim = type === 'in' ? 'border-green-500/30' : 'border-red-500/30';
    const labelBg = type === 'in' ? 'bg-green-500/80' : 'bg-red-500/80';

    // Show "copy from previous" button for Frame In when no image and previous plan has frame
    const showCopyFromPrevious = type === 'in' && !hasImage && hasPreviousFrame;

    return (
      <div
        className={cn(
          'relative rounded-xl overflow-hidden transition-all duration-200',
          borderColorDim,
          'border-2'
        )}
        style={frameStyle}
        onMouseEnter={() => setHoveredFrame(type)}
        onMouseLeave={() => setHoveredFrame(null)}
      >
        {/* Image or placeholder */}
        {hasImage ? (
          <StorageImg
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-slate-800/50 flex flex-col items-center justify-center gap-4">
            <ImageIcon className="w-16 h-16 text-slate-600" />
            {/* Show "copy from previous" button when no image */}
            {showCopyFromPrevious && (
              <button
                onClick={copyFromPreviousPlan}
                disabled={isExtractingFrame}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm",
                  isExtractingFrame
                    ? "bg-blue-500/10 text-blue-300 cursor-wait"
                    : "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                )}
              >
                {isExtractingFrame ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link className="w-4 h-4" />
                )}
                {isExtractingFrame ? 'Extraction...' : (willExtractFromVideo ? 'Extraire dernière frame' : 'Lier frame')}
              </button>
            )}
          </div>
        )}

        {/* Label - top left inside image */}
        <div className={cn('absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium text-white', labelBg)}>
          {label}
        </div>

        {/* Hover overlay with Gallery and Download */}
        {isHovered && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center gap-3">
            {/* Copy from previous plan button (for Frame In when previous exists) */}
            {type === 'in' && hasPreviousFrame && (
              <button
                className={cn(
                  "w-12 h-12 rounded-full backdrop-blur flex items-center justify-center transition-colors",
                  isExtractingFrame ? "bg-blue-500/60 cursor-wait" : "bg-blue-500/40 hover:bg-blue-500/60"
                )}
                onClick={copyFromPreviousPlan}
                disabled={isExtractingFrame}
                title={willExtractFromVideo ? 'Extraire dernière frame de la vidéo' : 'Lier dernière frame'}
              >
                {isExtractingFrame ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Link className="w-5 h-5 text-white" />
                )}
              </button>
            )}
            {/* Gallery picker button */}
            <button
              className="w-12 h-12 rounded-full bg-purple-500/40 backdrop-blur flex items-center justify-center hover:bg-purple-500/60 transition-colors"
              onClick={() => openGalleryPicker(type)}
              title="Choisir depuis la galerie"
            >
              <Images className="w-5 h-5 text-white" />
            </button>
            {/* Download button - only if image exists */}
            {hasImage && (
              <button
                className="w-12 h-12 rounded-full bg-green-500/40 backdrop-blur flex items-center justify-center hover:bg-green-500/60 transition-colors"
                onClick={() => handleDownloadFrame(type)}
                title="Télécharger"
              >
                <Download className="w-5 h-5 text-white" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] bg-[#0f1419] border-white/10 p-0 overflow-hidden flex flex-col">
        {/* HEADER */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-blue-400" />
              Plan {plan.shot_number}
              <span className="ml-2 px-2 py-0.5 rounded bg-white/5 text-xs text-slate-400">
                {ratioConfig.label} ({aspectRatio})
              </span>
            </DialogTitle>
          </div>

          {/* Camera Settings Row */}
          <div className="flex items-center gap-4 mt-4">
            {/* Duration: show picker in normal mode, or current duration in dialogue mode */}
            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Durée</Label>
              {hasDialogue ? (
                // In dialogue mode: duration is determined by audio, show current value or "auto"
                <span className="text-slate-400 text-xs px-2 py-1 bg-white/5 rounded">
                  {plan.generated_video_url ? (
                    // Video exists, show actual duration
                    <span className="text-white">{plan.duration}s</span>
                  ) : (
                    // No video yet, will be auto-determined
                    <span className="text-slate-500">auto (audio)</span>
                  )}
                </span>
              ) : (
                // Normal mode: duration picker
                <DurationPicker
                  value={plan.duration}
                  onChange={(duration) => onUpdate({ duration })}
                  compact
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Type</Label>
              <Select
                value={plan.shot_type || '_none'}
                onValueChange={(v) => onUpdate({ shot_type: v === '_none' ? null : v as ShotType })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs w-[130px]">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2e44] border-white/10">
                  <SelectItem value="_none" className="text-xs text-slate-500">-</SelectItem>
                  {SHOT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="text-xs">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Angle</Label>
              <Select
                value={plan.camera_angle || '_none'}
                onValueChange={(v) => onUpdate({ camera_angle: v === '_none' ? null : v as CameraAngle })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs w-[140px]">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2e44] border-white/10">
                  <SelectItem value="_none" className="text-xs text-slate-500">-</SelectItem>
                  {CAMERA_ANGLES.map((angle) => (
                    <SelectItem key={angle.value} value={angle.value} className="text-xs">
                      {angle.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Mouvement</Label>
              <Select
                value={plan.camera_movement || '_none'}
                onValueChange={(v) => onUpdate({ camera_movement: v === '_none' ? null : v as CameraMovement })}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs w-[140px]">
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2e44] border-white/10">
                  <SelectItem value="_none" className="text-xs text-slate-500">-</SelectItem>
                  {CAMERA_MOVEMENTS.map((movement) => (
                    <SelectItem key={movement.value} value={movement.value} className="text-xs">
                      {movement.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Audio Mode - group button */}
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-slate-400 text-xs whitespace-nowrap">Audio</Label>
              <div className="inline-flex rounded-lg bg-white/5 p-0.5">
                {([
                  { value: 'mute', label: 'Muet' },
                  { value: 'dialogue', label: 'Dialogue' },
                  { value: 'audio', label: 'Audio' },
                  { value: 'instrumental', label: 'Instru' },
                  { value: 'vocal', label: 'Vocal' },
                ] as const).map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => {
                      setAudioMode(mode.value);
                      onUpdate({ audio_mode: mode.value });
                      // Also sync has_dialogue when switching to/from dialogue mode
                      if (mode.value === 'dialogue' && !hasDialogue) {
                        setHasDialogue(true);
                        onUpdate({ has_dialogue: true, audio_mode: mode.value });
                      } else if (mode.value !== 'dialogue' && hasDialogue) {
                        setHasDialogue(false);
                        onUpdate({ has_dialogue: false, audio_mode: mode.value });
                      }
                    }}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                      audioMode === mode.value
                        ? mode.value === 'mute'
                          ? "bg-slate-600 text-white"
                          : mode.value === 'dialogue'
                          ? "bg-purple-500 text-white"
                          : "bg-blue-500 text-white"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </DialogHeader>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* CENTER: Frames Area - fills all available height */}
          <div className="flex-1 p-4 flex flex-col bg-[#0a0e12] overflow-hidden">
            {/* Top bar - View toggle (left/center) + Generate button (right) */}
            <div className="flex-shrink-0 mb-3 flex items-center justify-between">
              {/* Left spacer for centering */}
              <div className="w-32" />

              {/* Center: View toggle - Video / Frames (only if video exists) */}
              {(plan.generated_video_url || videoGenerationProgress) ? (
                <div className="inline-flex rounded-lg bg-white/5 p-1">
                  <button
                    onClick={() => setShowVideoPreview(true)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                      showVideoPreview
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    <Video className="w-3.5 h-3.5" />
                    Vidéo
                    {videoGenerationProgress?.status === 'generating' && (
                      <span className="text-xs text-blue-400">
                        {videoGenerationProgress.progress}%
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setShowVideoPreview(false)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                      !showVideoPreview
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:text-white"
                    )}
                  >
                    <Images className="w-3.5 h-3.5" />
                    Frames
                  </button>
                </div>
              ) : (
                <div />
              )}

              {/* Right: Generate Video button */}
              <div className="w-32 flex justify-end">
                <Button
                  size="sm"
                  className={cn(
                    'h-8',
                    canGenerateVideo && !isGeneratingVideo
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  )}
                  onClick={handleGenerateVideo}
                  disabled={!canGenerateVideo || isGeneratingVideo}
                >
                  {isGeneratingVideo ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      {videoGenerationProgress?.progress || 0}%
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                      Générer
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Video Preview Mode - shows generation card or completed video */}
            {showVideoPreview && (videoGenerationProgress || plan.generated_video_url) ? (
              <div className="flex-1 flex items-center justify-center">
                {/* Show generation card when generating */}
                {videoGenerationProgress && videoGenerationProgress.status === 'generating' ? (
                  <div style={frameStyle}>
                    <VideoGenerationCard
                      progress={videoGenerationProgress}
                      aspectRatio={aspectRatio}
                    />
                  </div>
                ) : plan.generated_video_url ? (
                  <div
                    className="relative rounded-xl overflow-hidden border-2 border-blue-500/30 bg-black group"
                    style={frameStyle}
                    onMouseEnter={() => setIsVideoHovered(true)}
                    onMouseLeave={() => setIsVideoHovered(false)}
                  >
                    {/* Video element - no default controls */}
                    <video
                      ref={videoRef}
                      src={plan.generated_video_url}
                      loop
                      muted={isMuted}
                      className="w-full h-full object-contain cursor-pointer"
                      onClick={togglePlayPause}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onTimeUpdate={handleVideoTimeUpdate}
                      onLoadedMetadata={handleVideoLoadedMetadata}
                    />

                    {/* Play/Pause overlay - visible on hover */}
                    {isVideoHovered && (
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.3) 0%, transparent 70%)' }}
                      >
                        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          {isPlaying ? (
                            <Pause className="w-10 h-10 text-white" />
                          ) : (
                            <Play className="w-10 h-10 text-white fill-white ml-1" />
                          )}
                        </div>
                      </div>
                    )}

                    {/* Video label - top left */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-blue-500/80 text-xs font-medium text-white flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      Vidéo générée
                    </div>

                    {/* Top right controls - fullscreen, download */}
                    <div className={cn(
                      "absolute top-2 right-2 flex items-center gap-2 transition-opacity duration-200",
                      isVideoHovered ? "opacity-100" : "opacity-0"
                    )}>
                      <button
                        onClick={handleDownloadVideo}
                        className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                        title="Télécharger"
                      >
                        <Download className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={openFullscreen}
                        className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                        title="Plein écran"
                      >
                        <Maximize2 className="w-4 h-4 text-white" />
                      </button>
                    </div>

                    {/* Bottom controls - slider, time, mute */}
                    <div className={cn(
                      "absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200",
                      isVideoHovered ? "opacity-100" : "opacity-0"
                    )}>
                      {/* Custom slider */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/70 w-10 text-right font-mono">
                          {formatTime(currentTime)}
                        </span>
                        <div className="flex-1 relative h-1 group/slider">
                          <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            step={0.1}
                            value={currentTime}
                            onChange={handleSliderChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          {/* Track background */}
                          <div className="absolute inset-0 bg-white/20 rounded-full" />
                          {/* Track progress */}
                          <div
                            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                          />
                          {/* Thumb */}
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/slider:opacity-100 transition-opacity"
                            style={{ left: duration ? `calc(${(currentTime / duration) * 100}% - 6px)` : '0' }}
                          />
                        </div>
                        <span className="text-xs text-white/70 w-10 font-mono">
                          {formatTime(duration)}
                        </span>
                        <button
                          onClick={toggleMute}
                          className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
                        >
                          {isMuted ? (
                            <VolumeX className="w-4 h-4 text-white/70" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-white/70" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
            /* Frames container - frames at edges, edit panel in center */
            <div className="flex w-full justify-between items-stretch flex-1">
              {/* Frame In - left */}
              <div className="flex-shrink-0 flex items-center">
                {renderFrame('in')}
              </div>

              {/* Center: Animation Prompt + Dialogue Panel (always visible) */}
              <div className="flex-1 mx-4 flex items-center justify-center">
                <div
                  className="bg-slate-900/95 backdrop-blur border border-blue-500/30 rounded-xl p-5 shadow-2xl flex flex-col w-full"
                  style={{ height: frameStyle.height }}
                >
                  {/* Animation Prompt - fills available space */}
                  <div className={cn(
                    "flex flex-col min-h-0",
                    hasDialogue || showCinematicDetails ? "flex-[2]" : "flex-1"
                  )}>
                    <Label className="text-blue-400 text-xs mb-1 block flex-shrink-0">Animation Prompt</Label>
                    <div className="flex-1 min-h-0">
                      <MentionInput
                        value={animationPrompt}
                        onChange={handleAnimationPromptChange}
                        placeholder="Décrivez l'animation... (@Personnage #Lieu)"
                        projectId={projectId}
                        minHeight="100%"
                        className="h-full"
                      />
                    </div>
                  </div>

                  {/* Cinematic Details Section - Collapsible */}
                  <div className="border-t border-white/10 pt-2 mt-2">
                    <button
                      onClick={() => setShowCinematicDetails(!showCinematicDetails)}
                      className="flex items-center justify-between w-full text-left group"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <Label className="text-amber-400 text-xs cursor-pointer group-hover:text-amber-300">
                          Détails Cinématiques
                        </Label>
                        {(shotSubject || framing || action || environment) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            {[shotSubject, framing, action, environment].filter(Boolean).length} champs
                          </span>
                        )}
                      </div>
                      <ChevronDown className={cn(
                        "w-4 h-4 text-slate-400 transition-transform",
                        showCinematicDetails && "rotate-180"
                      )} />
                    </button>

                    {showCinematicDetails && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {/* Shot Subject */}
                        <div>
                          <Label className="text-slate-500 text-[10px] mb-0.5 block">Sujet du plan</Label>
                          <input
                            value={shotSubject}
                            onChange={(e) => {
                              setShotSubject(e.target.value);
                              onUpdate({ shot_subject: e.target.value || undefined });
                            }}
                            placeholder="ex: Sarah's eyes, kitchen doorway"
                            className="w-full h-7 px-2 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                          />
                        </div>

                        {/* Framing */}
                        <div>
                          <Label className="text-slate-500 text-[10px] mb-0.5 block">Cadrage</Label>
                          <input
                            value={framing}
                            onChange={(e) => {
                              setFraming(e.target.value);
                              onUpdate({ framing: e.target.value || undefined });
                            }}
                            placeholder="ex: Tight close-up from nose up"
                            className="w-full h-7 px-2 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                          />
                        </div>

                        {/* Action */}
                        <div>
                          <Label className="text-slate-500 text-[10px] mb-0.5 block">Action</Label>
                          <input
                            value={action}
                            onChange={(e) => {
                              setAction(e.target.value);
                              onUpdate({ action: e.target.value || undefined });
                            }}
                            placeholder="ex: Her eyes widen slightly"
                            className="w-full h-7 px-2 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                          />
                        </div>

                        {/* Environment */}
                        <div>
                          <Label className="text-slate-500 text-[10px] mb-0.5 block">Environnement</Label>
                          <input
                            value={environment}
                            onChange={(e) => {
                              setEnvironment(e.target.value);
                              onUpdate({ environment: e.target.value || undefined });
                            }}
                            placeholder="ex: Kitchen background softly blurred"
                            className="w-full h-7 px-2 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                          />
                        </div>

                        {/* Dialogue Tone - full width */}
                        <div className="col-span-2">
                          <Label className="text-slate-500 text-[10px] mb-0.5 block">Ton du dialogue</Label>
                          <input
                            value={dialogueTone}
                            onChange={(e) => {
                              setDialogueTone(e.target.value);
                              onUpdate({ dialogue_tone: e.target.value || undefined });
                            }}
                            placeholder="ex: flatly, coldly, whispers, with tension"
                            className="w-full h-7 px-2 text-xs bg-white/5 border border-white/10 rounded text-white placeholder-slate-500 focus:border-amber-500/50 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dialogue section */}
                  <div
                    className={cn(
                      "border-t border-white/10 pt-2 mt-2",
                      hasDialogue ? "flex-[1] flex flex-col min-h-0" : "flex-shrink-0"
                    )}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {/* Dialogue header */}
                    <div className="flex items-center justify-between flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <Mic className="w-3 h-3 text-slate-400" />
                        {hasDialogue ? (
                          <Select
                            value={dialogueCharacterId || ''}
                            onValueChange={(v) => {
                              setDialogueCharacterId(v);
                              onUpdate({ dialogue_character_id: v });
                            }}
                          >
                            <SelectTrigger
                              className="bg-white/5 border-white/10 text-white h-7 text-xs w-32"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue placeholder="Personnage" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1a2e44] border-white/10 z-[9999]">
                              {dialogueCharacters.map((char) => (
                                <SelectItem key={char.id} value={char.id} className="text-xs">
                                  {char.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Label className="text-slate-400 text-xs">Dialogue</Label>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-slate-500 text-xs">{hasDialogue ? 'ON' : 'OFF'}</Label>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={hasDialogue}
                          onClick={() => {
                            const newValue = !hasDialogue;
                            setHasDialogue(newValue);
                            // Sync audio mode with dialogue toggle
                            const newAudioMode = newValue ? 'dialogue' : 'mute';
                            setAudioMode(newAudioMode);
                            onUpdate({ has_dialogue: newValue, audio_mode: newAudioMode });
                          }}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                            hasDialogue ? "bg-blue-500" : "bg-slate-600"
                          )}
                        >
                          <span
                            className={cn(
                              "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform",
                              hasDialogue ? "translate-x-4" : "translate-x-0"
                            )}
                          />
                        </button>
                      </div>
                    </div>
                    {hasDialogue && (
                      <div className="flex-1 mt-2 min-h-0 flex flex-col gap-2">
                        <MentionInput
                          value={dialogueText}
                          onChange={(value) => {
                            setDialogueText(value);
                            onUpdate({ dialogue_text: value });
                          }}
                          placeholder="Ce que le personnage dit..."
                          projectId={projectId}
                          minHeight="60px"
                          className="flex-1"
                        />
                        {/* Add Audio button - separate step */}
                        {plan.generated_video_url && dialogueText && dialogueCharacterId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                            onClick={handleAddAudio}
                            disabled={isAddingAudio}
                          >
                            {isAddingAudio ? (
                              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                            ) : (
                              <Mic className="w-3 h-3 mr-2" />
                            )}
                            Ajouter Audio
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* Frame Out - right (hidden for OmniHuman, shown for Kling Dialog) */}
              {showFrameOut && (
                <div className="flex-shrink-0 flex items-center">
                  {renderFrame('out')}
                </div>
              )}
            </div>
            )}

            {/* Music Picker Panel - shown for instrumental/vocal modes, only in Frames view */}
            {!showVideoPreview && (audioMode === 'instrumental' || audioMode === 'vocal') && (
              <div className="flex-shrink-0 mt-2 px-3 py-2 rounded-lg bg-slate-900/80 border border-blue-500/20">
                {musicAssets.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-1">
                    <Music className="w-3.5 h-3.5 text-slate-500" />
                    <p className="text-xs text-slate-400">Aucune musique — Ajoutez via la Bible</p>
                  </div>
                ) : !selectedAudioAssetId ? (
                  /* Music cards selection - compact horizontal list */
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                    <div className="flex gap-2 overflow-x-auto py-0.5">
                      {musicAssets.map((audio) => {
                        const audioData = audio.data as { duration?: number };
                        return (
                          <button
                            key={audio.id}
                            onClick={() => {
                              const audioDur = audioData.duration || 180;
                              const endTime = Math.min(audioDur, selectionDuration);
                              setSelectedAudioAssetId(audio.id);
                              setAudioStart(0);
                              setAudioEnd(endTime);
                              onUpdate({ audio_asset_id: audio.id, audio_start: 0, audio_end: endTime });
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md border bg-white/5 border-white/10 hover:bg-blue-500/20 hover:border-blue-500/50 transition-all"
                          >
                            <span className="text-xs font-medium text-white whitespace-nowrap">{audio.name}</span>
                            {audioData.duration && (
                              <span className="text-[10px] text-slate-500">
                                {Math.floor(audioData.duration / 60)}:{String(Math.floor(audioData.duration % 60)).padStart(2, '0')}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Waveform timeline editor - compact */
                  <div className="flex items-center gap-3">
                    {/* Play/Pause button */}
                    <button
                      onClick={toggleMusicPlay}
                      disabled={isLoadingWaveform}
                      className={cn(
                        "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all",
                        "bg-blue-600 hover:bg-blue-500 text-white",
                        isLoadingWaveform && "opacity-50 cursor-wait"
                      )}
                    >
                      {isLoadingWaveform ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : isMusicPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>

                    {/* Waveform visualization - inline */}
                    <div className="relative flex-1 h-10 bg-slate-800/50 rounded overflow-hidden">
                      {isLoadingWaveform ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                        </div>
                      ) : (
                        <>
                          {/* Waveform bars */}
                          <div className="absolute inset-0 flex items-center justify-around px-0.5 pointer-events-none">
                            {audioWaveform.map((value, i) => {
                              const position = i / audioWaveform.length;
                              const startPos = audioStart / musicDuration;
                              const endPos = (audioEnd ?? (audioStart + selectionDuration)) / musicDuration;
                              const isInRange = position >= startPos && position <= endPos;

                              return (
                                <div
                                  key={i}
                                  className={cn(
                                    "w-0.5 rounded-full",
                                    isInRange ? "bg-blue-400" : "bg-slate-600/40"
                                  )}
                                  style={{ height: `${value * 80}%` }}
                                />
                              );
                            })}
                          </div>

                          {/* Selection overlay - dimmed areas outside selection */}
                          <div
                            className="absolute top-0 bottom-0 left-0 bg-black/50 pointer-events-none"
                            style={{ width: `${(audioStart / musicDuration) * 100}%` }}
                          />
                          <div
                            className="absolute top-0 bottom-0 right-0 bg-black/50 pointer-events-none"
                            style={{ width: `${((musicDuration - (audioEnd ?? selectionDuration)) / musicDuration) * 100}%` }}
                          />

                          {/* Draggable selection zone with resize handles */}
                          {(() => {
                            const effectiveSelection = Math.min(selectionDuration, musicDuration);
                            const currentSelectionWidth = (audioEnd ?? effectiveSelection) - audioStart;
                            const minSelectionWidth = 1; // Minimum 1 second

                            return (
                              <>
                                {/* Main selection zone - drag to move */}
                                <div
                                  className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing hover:bg-blue-500/10 transition-colors"
                                  style={{
                                    left: `${(audioStart / musicDuration) * 100}%`,
                                    width: `${(currentSelectionWidth / musicDuration) * 100}%`,
                                  }}
                                  onMouseDown={(e) => {
                                    // Ignore if clicking on handles
                                    if ((e.target as HTMLElement).dataset.handle) return;
                                    e.preventDefault();
                                    const container = e.currentTarget.parentElement;
                                    if (!container) return;
                                    const rect = container.getBoundingClientRect();
                                    const startX = e.clientX;
                                    const initialStart = audioStart;
                                    const selWidth = currentSelectionWidth;

                                    let lastStart = audioStart;
                                    let lastEnd = audioEnd ?? effectiveSelection;

                                    const onMove = (moveE: MouseEvent) => {
                                      const deltaX = moveE.clientX - startX;
                                      const deltaTime = (deltaX / rect.width) * musicDuration;
                                      let newStart = initialStart + deltaTime;
                                      newStart = Math.max(0, Math.min(newStart, musicDuration - selWidth));
                                      const newEnd = newStart + selWidth;
                                      lastStart = newStart;
                                      lastEnd = newEnd;
                                      setAudioStart(newStart);
                                      setAudioEnd(newEnd);
                                    };

                                    const onUp = () => {
                                      document.removeEventListener('mousemove', onMove);
                                      document.removeEventListener('mouseup', onUp);
                                      onUpdate({ audio_start: lastStart, audio_end: lastEnd });
                                    };

                                    document.addEventListener('mousemove', onMove);
                                    document.addEventListener('mouseup', onUp);
                                  }}
                                />

                                {/* Left handle - drag to adjust start */}
                                <div
                                  data-handle="left"
                                  className="absolute top-0 bottom-0 w-2 cursor-ew-resize bg-green-500 hover:bg-green-400 transition-colors z-10"
                                  style={{
                                    left: `calc(${(audioStart / musicDuration) * 100}% - 4px)`,
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const container = e.currentTarget.parentElement;
                                    if (!container) return;
                                    const rect = container.getBoundingClientRect();
                                    const currentEnd = audioEnd ?? effectiveSelection;

                                    let lastStart = audioStart;

                                    const onMove = (moveE: MouseEvent) => {
                                      const x = moveE.clientX - rect.left;
                                      let newStart = (x / rect.width) * musicDuration;
                                      // Clamp: min 0, max is end - minWidth
                                      newStart = Math.max(0, Math.min(newStart, currentEnd - minSelectionWidth));
                                      lastStart = newStart;
                                      setAudioStart(newStart);
                                    };

                                    const onUp = () => {
                                      document.removeEventListener('mousemove', onMove);
                                      document.removeEventListener('mouseup', onUp);
                                      onUpdate({ audio_start: lastStart, audio_end: currentEnd });
                                    };

                                    document.addEventListener('mousemove', onMove);
                                    document.addEventListener('mouseup', onUp);
                                  }}
                                />

                                {/* Right handle - drag to adjust end */}
                                <div
                                  data-handle="right"
                                  className="absolute top-0 bottom-0 w-2 cursor-ew-resize bg-red-500 hover:bg-red-400 transition-colors z-10"
                                  style={{
                                    left: `calc(${((audioEnd ?? effectiveSelection) / musicDuration) * 100}% - 4px)`,
                                  }}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const container = e.currentTarget.parentElement;
                                    if (!container) return;
                                    const rect = container.getBoundingClientRect();

                                    let lastEnd = audioEnd ?? effectiveSelection;

                                    const onMove = (moveE: MouseEvent) => {
                                      const x = moveE.clientX - rect.left;
                                      let newEnd = (x / rect.width) * musicDuration;
                                      // Clamp: min is start + minWidth, max is musicDuration
                                      newEnd = Math.max(audioStart + minSelectionWidth, Math.min(newEnd, musicDuration));
                                      lastEnd = newEnd;
                                      setAudioEnd(newEnd);
                                    };

                                    const onUp = () => {
                                      document.removeEventListener('mousemove', onMove);
                                      document.removeEventListener('mouseup', onUp);
                                      onUpdate({ audio_start: audioStart, audio_end: lastEnd });
                                    };

                                    document.addEventListener('mousemove', onMove);
                                    document.addEventListener('mouseup', onUp);
                                  }}
                                />
                              </>
                            );
                          })()}

                          {/* Playhead */}
                          {isMusicPlaying && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-white pointer-events-none"
                              style={{ left: `${(musicCurrentTime / musicDuration) * 100}%` }}
                            />
                          )}
                        </>
                      )}
                    </div>

                    {/* Time display */}
                    <div className="flex-shrink-0 text-[10px] text-slate-400 tabular-nums whitespace-nowrap">
                      <span className="text-green-400">{formatTimeAudio(audioStart)}</span>
                      <span className="text-slate-500">-</span>
                      <span className="text-red-400">{formatTimeAudio(audioEnd ?? selectionDuration)}</span>
                    </div>

                    {/* Change button */}
                    <button
                      onClick={() => {
                        setSelectedAudioAssetId(null);
                        setAudioWaveform([]);
                        setAudioStart(0);
                        setAudioEnd(selectionDuration);
                        setMusicDuration(0);
                        if (musicPlayerRef.current) {
                          musicPlayerRef.current.pause();
                          musicPlayerRef.current = null;
                          setIsMusicPlaying(false);
                        }
                        onUpdate({ audio_asset_id: null, audio_start: 0, audio_end: null });
                      }}
                      className="flex-shrink-0 text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>


          {/* RIGHT PANEL: Video Generation Settings */}
          {/* Side panel - collapsed by default, expandable for advanced options */}
          <div className={cn(
            "flex-shrink-0 border-l border-white/10 overflow-y-auto bg-[#0d1218] transition-all duration-200",
            showAdvancedVideo ? "w-[260px] p-4" : "w-10 p-2"
          )}>
            {/* Toggle button */}
            <button
              onClick={() => setShowAdvancedVideo(!showAdvancedVideo)}
              className="w-6 h-6 flex items-center justify-center rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white mb-2"
              title={showAdvancedVideo ? "Masquer les options" : "Options avancées"}
            >
              <Settings className="w-4 h-4" />
            </button>

            {showAdvancedVideo && (
              <div className="space-y-4">
                {/* Video Generation Section */}
                <div>
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                    Génération vidéo
                  </h3>

                  <div className="space-y-3">
                    {/* Provider selector - only show if NOT in dialogue mode (dialogue = auto fal.ai) */}
                    {!hasDialogue && (
                      <div>
                        <Label className="text-slate-400 text-xs mb-1.5 block">Provider</Label>
                        <div className="inline-flex rounded-lg bg-white/5 p-1 w-full">
                          {(['fal', 'runway'] as VideoProvider[]).map((provider) => (
                            <button
                              key={provider}
                              onClick={() => setVideoProvider(provider)}
                              className={cn(
                                "flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all",
                                videoProvider === provider
                                  ? "bg-white/10 text-white"
                                  : "text-slate-400 hover:text-white"
                              )}
                            >
                              {PROVIDER_INFO[provider].name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Model selector - only show if NOT in dialogue mode (dialogue = auto OmniHuman) */}
                    {!hasDialogue && (
                      <div>
                        <Label className="text-slate-300 text-xs mb-1 block">Modèle</Label>
                        <Select value={videoModel} onValueChange={setVideoModel}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-[#1a2e44] border-white/10">
                            {availableVideoModels.map((model) => (
                              <SelectItem key={model.value} value={model.value} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <span>{model.label}</span>
                                  <span className="text-slate-500">({model.duration.join('/')}s)</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Info for dialogue mode */}
                    {hasDialogue && (
                      <div className="text-xs text-slate-400 bg-white/5 rounded-lg p-2">
                        <p className="text-purple-400 font-medium">Mode dialogue activé</p>
                        <p className="mt-1">OmniHuman 1.5 (fal.ai) - auto</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gallery Picker Modal */}
        <GalleryPicker
          isOpen={showGalleryPicker}
          onClose={() => {
            setShowGalleryPicker(false);
            setPickingFrame(null);
          }}
          onSelect={(url) => handleImageSelect(url)}
          title={`Choisir Frame ${pickingFrame === 'in' ? 'In' : 'Out'}`}
          aspectRatio={aspectRatio}
          currentProjectId={projectId}
          allowOtherProjects={true}
        />
      </DialogContent>

      {/* Fullscreen Video Modal - rendered via portal */}
      {isFullscreen && plan.generated_video_url && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={closeFullscreen}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Download button */}
          <button
            onClick={handleDownloadVideo}
            className="absolute top-4 right-20 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
            title="Télécharger"
          >
            <Download className="w-5 h-5 text-white" />
          </button>

          {/* Video - clean fullscreen with custom controls */}
          <div className="relative w-full h-full flex items-center justify-center group">
            <video
              src={plan.generated_video_url}
              autoPlay
              loop
              controls={false}
              className="max-w-full max-h-full object-contain cursor-pointer"
              onClick={(e) => {
                const video = e.currentTarget;
                if (video.paused) {
                  video.play();
                } else {
                  video.pause();
                }
              }}
            />

            {/* Keyboard hint */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
              Appuie sur Échap pour fermer
            </div>
          </div>
        </div>,
        document.body
      )}
    </Dialog>
  );
}
