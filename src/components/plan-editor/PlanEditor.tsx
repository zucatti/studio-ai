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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GalleryPicker } from '@/components/gallery/GalleryPicker';
import { ProjectBiblePicker } from '@/components/clip/ProjectBiblePicker';
import { QuickShotGenerator } from '@/components/quick-shot/QuickShotGenerator';
import { StorageImg } from '@/components/ui/storage-image';
import { FrameEditor } from './FrameEditor';
import {
  Film,
  Play,
  Pause,
  Mic,
  Images,
  Video,
  Maximize2,
  Volume2,
  VolumeX,
  Download,
  X,
  Loader2,
  Wand2,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { useBibleStore } from '@/store/bible-store';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/use-signed-url';
import type { VideoProvider } from '@/lib/ai/video-provider';

import type {
  PlanEditorProps,
  PlanData,
  MODE_CONFIG as ModeConfigType,
  ASPECT_RATIO_CONFIG as AspectConfigType,
} from './types';
import { MODE_CONFIG, ASPECT_RATIO_CONFIG } from './types';
import type { ShotType, CameraAngle, CameraMovement, Shot } from '@/types/database';

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

// Duration options
const DURATION_OPTIONS = [3, 5, 7, 10];

interface PlanEditorModalProps extends PlanEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlanEditor({
  open,
  onOpenChange,
  mode,
  plan,
  previousPlan,
  projectId,
  aspectRatio,
  onUpdate,
  onClose,
  onGenerateVideo,
  isGeneratingVideo,
  videoGenerationProgress,
  onGenerateImage,
  isGeneratingImage,
}: PlanEditorModalProps) {
  const config = MODE_CONFIG[mode];
  const ratioConfig = ASPECT_RATIO_CONFIG[aspectRatio] || ASPECT_RATIO_CONFIG['16:9'];

  // === LOCAL STATE ===

  // Animation prompt
  const [animationPrompt, setAnimationPrompt] = useState('');

  // Dialogue (mode video-free only)
  const [hasDialogue, setHasDialogue] = useState(false);
  const [dialogueText, setDialogueText] = useState('');
  const [dialogueCharacterId, setDialogueCharacterId] = useState<string | null>(null);

  // Audio mode (mode video-free only)
  const [audioMode, setAudioMode] = useState<'mute' | 'dialogue' | 'audio' | 'instrumental' | 'vocal'>('mute');

  // Gallery/Bible picker state
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);
  const [showBiblePicker, setShowBiblePicker] = useState(false);
  const [pickingFrame, setPickingFrame] = useState<'in' | 'out' | null>(null);

  // Scene generator (QuickShot) state
  const [showSceneGenerator, setShowSceneGenerator] = useState(false);
  const [generatingFrame, setGeneratingFrame] = useState<'in' | 'out' | null>(null);

  // Video generation - auto-select based on dialogue
  // With dialogue → fal.ai + OmniHuman 1.5 (lip-sync)
  // Without dialogue → fal.ai + Kling 3.0 Omni (best video quality)
  const videoProvider = 'fal';
  const videoModel = hasDialogue ? 'omnihuman' : 'kling-omni';

  // Video preview
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Frame linking state
  const [isExtractingFrame, setIsExtractingFrame] = useState(false);

  // Prompt display state
  const [showVideoPrompt, setShowVideoPrompt] = useState(false);
  const [copiedVideoPrompt, setCopiedVideoPrompt] = useState(false);

  // Sticky generating state to prevent flickering
  // Once we start generating, stay in that mode until video URL changes
  const [stickyGenerating, setStickyGenerating] = useState(false);
  const lastVideoUrlRef = useRef(plan?.generated_video_url);
  // Track if we've ever completed for this plan to prevent re-triggering
  const hasCompletedRef = useRef(false);

  // Bible store
  const { projectAssets, fetchProjectAssets } = useBibleStore();

  // Signed URL for video (b2:// -> https://)
  const { signedUrl: signedVideoUrl } = useSignedUrl(plan?.generated_video_url);

  // === EFFECTS ===

  // Fetch project assets
  useEffect(() => {
    fetchProjectAssets(projectId);
  }, [projectId, fetchProjectAssets]);

  // Sync state with plan
  useEffect(() => {
    if (plan) {
      setAnimationPrompt(plan.animation_prompt || plan.description || '');
      setHasDialogue(plan.has_dialogue ?? false);
      setDialogueText(plan.dialogue_text ?? '');
      setDialogueCharacterId(plan.dialogue_character_id ?? null);
      setAudioMode(plan.audio_mode || 'mute');
      setShowVideoPreview(!!plan.generated_video_url);
    }
  }, [plan?.id]);

  // Auto-show video preview when video is generated
  useEffect(() => {
    if (plan?.generated_video_url && !isGeneratingVideo) {
      setShowVideoPreview(true);
    }
  }, [plan?.generated_video_url, isGeneratingVideo]);

  // Manage sticky generating state to prevent flickering
  useEffect(() => {
    // Reset completion tracking when plan changes
    if (plan?.id) {
      hasCompletedRef.current = false;
    }
  }, [plan?.id]);

  useEffect(() => {
    // Start sticky mode when generation begins (only if not already completed)
    if (isGeneratingVideo && !stickyGenerating && !hasCompletedRef.current) {
      setStickyGenerating(true);
      lastVideoUrlRef.current = plan?.generated_video_url;
    }

    // End sticky mode ONLY when video URL actually changed (new video is ready)
    // Don't rely on status alone as it can flicker during polling
    if (stickyGenerating) {
      const videoUrlChanged = plan?.generated_video_url && plan.generated_video_url !== lastVideoUrlRef.current;
      const isError = videoGenerationProgress?.status === 'error' || videoGenerationProgress?.status === 'failed';

      if (videoUrlChanged) {
        // New video is ready - end sticky mode and mark as completed
        setStickyGenerating(false);
        lastVideoUrlRef.current = plan?.generated_video_url;
        hasCompletedRef.current = true;
      } else if (isError) {
        // Error occurred - end sticky mode
        setStickyGenerating(false);
        hasCompletedRef.current = true;
      }
    }
  }, [isGeneratingVideo, stickyGenerating, plan?.generated_video_url, videoGenerationProgress?.status]);

  // Effective generating state (combines prop and sticky state)
  // Once we've completed (video URL changed), never show generating state again for this session
  // This prevents flickering from polling inconsistencies
  const effectivelyGenerating = useMemo(() => {
    // If we've already completed generation and have a video, don't show generating
    if (hasCompletedRef.current && plan?.generated_video_url) {
      return false;
    }
    return isGeneratingVideo || stickyGenerating;
  }, [isGeneratingVideo, stickyGenerating, plan?.generated_video_url]);

  // ESC key for fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // === COMPUTED ===

  // Check if Frame Out should be shown (hidden for dialogue mode - OmniHuman doesn't support it)
  const showFrameOut = config.showFrameOut && !hasDialogue;

  // Characters for dialogue
  const dialogueCharacters = useMemo(() => {
    return projectAssets
      .filter((asset) => asset.asset_type === 'character')
      .map((asset) => ({
        id: asset.id,
        name: asset.name,
        voice_id: (asset.data as Record<string, unknown>)?.voice_id as string | null,
      }));
  }, [projectAssets]);

  // Previous plan linkable content
  const previousVideoUrl = previousPlan?.generated_video_url;
  const previousLastFrameUrl = previousPlan?.last_frame_url;
  const previousFirstFrameUrl = previousPlan?.storyboard_image_url || previousPlan?.first_frame_url;
  const hasPreviousFrame = !!previousVideoUrl || !!previousLastFrameUrl || !!previousFirstFrameUrl;
  const willExtractFromVideo = !!previousVideoUrl;

  // Frame dimensions - adapted for top/bottom layout
  const frameStyle = useMemo(() => {
    // Leave space for prompt panel below (approx 40% of viewport height)
    // Portrait frames are taller, landscape frames are wider
    const maxHeight = ratioConfig.isPortrait ? 380 : 280;
    const ratio = ratioConfig.width / ratioConfig.height;
    const height = maxHeight;
    const width = height * ratio;
    return { width, height };
  }, [ratioConfig]);

  const hasFrameIn = !!(plan?.storyboard_image_url || plan?.first_frame_url);
  const canGenerateVideo = hasFrameIn && config.showVideoGeneration;

  // === HANDLERS ===

  const handleAnimationPromptChange = useCallback((value: string) => {
    setAnimationPrompt(value);
    onUpdate({ animation_prompt: value });
  }, [onUpdate]);

  const handleDurationChange = useCallback((duration: number) => {
    onUpdate({ duration });
  }, [onUpdate]);

  // Gallery/Bible selection
  const openGalleryPicker = useCallback((frameType: 'in' | 'out') => {
    setPickingFrame(frameType);
    setShowGalleryPicker(true);
  }, []);

  const openBiblePicker = useCallback((frameType: 'in' | 'out') => {
    setPickingFrame(frameType);
    setShowBiblePicker(true);
  }, []);

  const openSceneGenerator = useCallback((frameType: 'in' | 'out') => {
    console.log('[PlanEditor] Opening scene generator for frame:', frameType);
    setGeneratingFrame(frameType);
    setShowSceneGenerator(true);
  }, []);

  const handleGeneratedShots = useCallback((shots: Shot[]) => {
    if (shots.length > 0 && shots[0].storyboard_image_url) {
      const url = shots[0].storyboard_image_url;
      if (generatingFrame === 'in') {
        onUpdate({ storyboard_image_url: url, first_frame_url: url });
      } else if (generatingFrame === 'out') {
        onUpdate({ last_frame_url: url });
      }
      setShowSceneGenerator(false);
      setGeneratingFrame(null);
      toast.success(`Frame ${generatingFrame === 'in' ? 'In' : 'Out'} générée`);
    }
  }, [generatingFrame, onUpdate]);

  // Handle image selection from multi-mode generator
  const handleImageSelected = useCallback((imageUrl: string) => {
    if (generatingFrame === 'in') {
      onUpdate({ storyboard_image_url: imageUrl, first_frame_url: imageUrl });
    } else if (generatingFrame === 'out') {
      onUpdate({ last_frame_url: imageUrl });
    }
    setShowSceneGenerator(false);
    setGeneratingFrame(null);
    toast.success(`Frame ${generatingFrame === 'in' ? 'In' : 'Out'} sélectionnée`);
  }, [generatingFrame, onUpdate]);

  const handleImageSelect = useCallback((url: string) => {
    const frameType = pickingFrame; // Capture before clearing
    if (frameType === 'in') {
      onUpdate({ storyboard_image_url: url, first_frame_url: url });
    } else if (frameType === 'out') {
      onUpdate({ last_frame_url: url });
    }
    setShowGalleryPicker(false);
    setShowBiblePicker(false);
    setPickingFrame(null);
    if (frameType) {
      toast.success(`Frame ${frameType === 'in' ? 'In' : 'Out'} sélectionnée`);
    }
  }, [pickingFrame, onUpdate]);

  // Link previous plan's last frame
  const copyFromPreviousPlan = useCallback(async () => {
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
            outputFormat: 'png',
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to extract frame');
        }

        const { frameUrl } = await response.json();
        onUpdate({ storyboard_image_url: frameUrl, first_frame_url: frameUrl });
        toast.success('Dernière frame extraite!', { id: 'extract-frame' });
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('FFmpeg frame extraction failed:', errorMsg);
        toast.error(`Extraction échouée: ${errorMsg}`, { id: 'extract-frame' });
      } finally {
        setIsExtractingFrame(false);
      }
    }

    if (previousLastFrameUrl) {
      onUpdate({ storyboard_image_url: previousLastFrameUrl, first_frame_url: previousLastFrameUrl });
      toast.success('Dernière frame liée!');
      return;
    }

    if (previousFirstFrameUrl) {
      onUpdate({ storyboard_image_url: previousFirstFrameUrl, first_frame_url: previousFirstFrameUrl });
      toast.warning('Première frame utilisée (pas de dernière frame)');
      return;
    }

    toast.error('Aucune frame disponible');
  }, [previousVideoUrl, previousLastFrameUrl, previousFirstFrameUrl, projectId, onUpdate]);

  // Video generation
  const handleGenerateVideo = useCallback(async () => {
    // Check for Frame In
    const hasFrameIn = !!(plan?.storyboard_image_url || plan?.first_frame_url);
    if (!hasFrameIn) {
      toast.error('Frame In requise pour générer la vidéo');
      return;
    }
    if (!onGenerateVideo) return;

    // Switch to Video tab immediately
    setShowVideoPreview(true);

    await onGenerateVideo(plan.id, {
      videoModel,
      duration: plan.duration,
      videoProvider,
    });

    // Simple user-friendly message
    const modelName = hasDialogue ? 'OmniHuman' : 'Kling O3 Pro';
    toast.success(`Génération ${modelName} lancée...`);
  }, [plan, videoModel, videoProvider, hasDialogue, onGenerateVideo]);

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
    setVideoDuration(videoRef.current.duration);
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

  const handleDownloadVideo = useCallback(() => {
    if (!plan?.generated_video_url) return;
    const filename = `plan-${plan.number || plan.id}-video.mp4`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(plan.generated_video_url)}&filename=${encodeURIComponent(filename)}`;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 5000);
    toast.success('Téléchargement démarré');
  }, [plan]);

  const handleDownloadFrame = useCallback((type: 'in' | 'out') => {
    const url = type === 'in' ? plan?.storyboard_image_url : plan?.last_frame_url;
    if (!url) return;
    const ext = url.split('?')[0].match(/\.(png|jpg|jpeg|webp)$/i)?.[1] || 'png';
    const filename = `plan-${plan?.number || plan?.id}-frame-${type}.${ext}`;
    const downloadUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = downloadUrl;
    document.body.appendChild(iframe);
    setTimeout(() => document.body.removeChild(iframe), 5000);
    toast.success('Téléchargement démarré');
  }, [plan]);

  const handleClearFrame = useCallback((type: 'in' | 'out') => {
    if (type === 'in') {
      onUpdate({
        storyboard_image_url: null,
        first_frame_url: null,
        storyboard_prompt: null,
        first_frame_prompt: null,
      });
    } else {
      onUpdate({
        last_frame_url: null,
        last_frame_prompt: null,
      });
    }
    toast.success(`Frame ${type === 'in' ? 'In' : 'Out'} supprimée`);
  }, [onUpdate]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleCopyVideoPrompt = useCallback(async () => {
    if (plan?.video_prompt) {
      await navigator.clipboard.writeText(plan.video_prompt);
      setCopiedVideoPrompt(true);
      setTimeout(() => setCopiedVideoPrompt(false), 2000);
    }
  }, [plan?.video_prompt]);

  if (!plan) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] h-[90vh] bg-[#0f1419] border-white/10 p-0 overflow-hidden flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* HEADER */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white flex items-center gap-2">
              <Film className="w-5 h-5 text-blue-400" />
              Plan {plan.number || ''}
              <span className="ml-2 px-2 py-0.5 rounded bg-white/5 text-xs text-slate-400">
                {ratioConfig.label} ({aspectRatio})
              </span>
            </DialogTitle>
          </div>

          {/* Settings Row */}
          <div className="flex items-center gap-4 mt-4">
            {/* Duration */}
            {config.showDuration && (
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-xs whitespace-nowrap">Durée</Label>
                {config.durationEditable ? (
                  <div className="inline-flex rounded-lg bg-white/5 p-0.5">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d}
                        onClick={() => handleDurationChange(d)}
                        className={cn(
                          'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                          plan.duration === d
                            ? 'bg-blue-500 text-white'
                            : 'text-slate-400 hover:text-white'
                        )}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-400 text-xs px-2 py-1 bg-white/5 rounded">
                    {plan.duration}s
                  </span>
                )}
              </div>
            )}

            {/* Camera settings */}
            {config.showCameraSettings && (
              <>
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
              </>
            )}

            {/* Audio Mode (video-free only) */}
            {config.showAudioMode && (
              <div className="flex items-center gap-2 ml-auto">
                <Label className="text-slate-400 text-xs whitespace-nowrap">Audio</Label>
                <div className="inline-flex rounded-lg bg-white/5 p-0.5">
                  {([
                    { value: 'mute', label: 'Muet' },
                    { value: 'dialogue', label: 'Dialogue' },
                    { value: 'audio', label: 'Audio' },
                    { value: 'instrumental', label: 'Instru' },
                    { value: 'vocal', label: 'Vocal' },
                  ] as const).map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        setAudioMode(m.value);
                        onUpdate({ audio_mode: m.value });
                        if (m.value === 'dialogue' && !hasDialogue) {
                          setHasDialogue(true);
                          onUpdate({ has_dialogue: true, audio_mode: m.value });
                        } else if (m.value !== 'dialogue' && hasDialogue) {
                          setHasDialogue(false);
                          onUpdate({ has_dialogue: false, audio_mode: m.value });
                        }
                      }}
                      className={cn(
                        'px-2.5 py-1 text-xs font-medium rounded-md transition-all',
                        audioMode === m.value
                          ? m.value === 'mute'
                            ? 'bg-slate-600 text-white'
                            : m.value === 'dialogue'
                              ? 'bg-purple-500 text-white'
                              : 'bg-blue-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* MAIN CONTENT */}
        <div className="flex flex-1 overflow-hidden">
          {/* CENTER: Frames Area */}
          <div className="flex-1 p-4 flex flex-col bg-[#0a0e12] overflow-hidden">
            {/* Top bar */}
            <div className="flex-shrink-0 mb-3 flex items-center justify-between">
              <div className="w-32" />

              {/* View toggle */}
              {config.showVideoGeneration && (plan.generated_video_url || effectivelyGenerating || videoGenerationProgress) ? (
                <div className="inline-flex rounded-lg bg-white/5 p-1">
                  <button
                    onClick={() => setShowVideoPreview(true)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                      showVideoPreview ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    <Video className="w-3.5 h-3.5" />
                    Vidéo
                  </button>
                  <button
                    onClick={() => setShowVideoPreview(false)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                      !showVideoPreview ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                    )}
                  >
                    <Images className="w-3.5 h-3.5" />
                    Frames
                  </button>
                </div>
              ) : (
                <div />
              )}

              {/* Generate button */}
              <div className="w-32 flex justify-end">
                {config.showVideoGeneration && (
                  <Button
                    size="sm"
                    className={cn(
                      'h-8',
                      canGenerateVideo && !effectivelyGenerating
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    )}
                    onClick={handleGenerateVideo}
                    disabled={!canGenerateVideo || effectivelyGenerating}
                  >
                    {effectivelyGenerating ? (
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
                )}
              </div>
            </div>

            {/* Video Preview Mode */}
            {showVideoPreview && (plan.generated_video_url || effectivelyGenerating) ? (
              <div className="flex-1 flex items-center justify-center">
                {/* Generation in progress card - show when generating, even if there's a previous video */}
                {/* effectivelyGenerating stays true until new video is ready, preventing flicker */}
                {effectivelyGenerating ? (
                  <div
                    className="relative rounded-xl overflow-hidden border-2 border-purple-500/50"
                    style={frameStyle}
                  >
                    {/* Animated rainbow radial gradient background */}
                    <div className="absolute inset-0 rainbow-radial-animation" />
                    {/* Dark overlay for readability */}
                    <div className="absolute inset-0 bg-black/30" />

                    {/* Frame In preview as background */}
                    {(plan.storyboard_image_url || plan.first_frame_url) && (
                      <StorageImg
                        src={(plan.storyboard_image_url || plan.first_frame_url)!}
                        alt="Frame In"
                        className="absolute inset-0 w-full h-full object-cover opacity-30"
                      />
                    )}

                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      {/* Icon with pulsing ring */}
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                          <Video className="w-8 h-8 text-white" />
                        </div>
                        <div className="absolute inset-0 -m-2 rounded-full border-2 border-white/30 animate-ping" />
                      </div>

                      <div className="text-center">
                        <div className="text-white font-medium text-lg">
                          {hasDialogue ? 'OmniHuman 1.5' : 'Kling O3 Pro'}
                        </div>
                        <div className="text-slate-300 text-sm mt-1">
                          {videoGenerationProgress?.message || 'Génération en cours...'}
                        </div>
                        <div className="text-3xl font-bold text-white mt-3">
                          {videoGenerationProgress?.progress || 0}%
                        </div>
                      </div>
                    </div>

                    {/* Progress bar at bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/50">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-300 ease-out"
                        style={{ width: `${videoGenerationProgress?.progress || 0}%` }}
                      />
                    </div>

                    {/* CSS for rainbow animation */}
                    <style jsx>{`
                      .rainbow-radial-animation {
                        background: conic-gradient(
                          from 0deg,
                          #ff0000,
                          #ff8000,
                          #ffff00,
                          #00ff00,
                          #00ffff,
                          #0080ff,
                          #8000ff,
                          #ff0080,
                          #ff0000
                        );
                        animation: rainbow-spin 3s linear infinite;
                        filter: blur(40px);
                        opacity: 0.7;
                        transform: scale(1.5);
                      }

                      @keyframes rainbow-spin {
                        from { transform: scale(1.5) rotate(0deg); }
                        to { transform: scale(1.5) rotate(360deg); }
                      }
                    `}</style>
                  </div>
                ) : (
                <div
                  className="relative rounded-xl overflow-hidden border-2 border-blue-500/30 bg-black group"
                  style={frameStyle}
                  onMouseEnter={() => setIsVideoHovered(true)}
                  onMouseLeave={() => setIsVideoHovered(false)}
                >
                  <video
                    ref={videoRef}
                    src={signedVideoUrl || undefined}
                    loop
                    muted={isMuted}
                    className="w-full h-full object-contain cursor-pointer"
                    onClick={togglePlayPause}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onTimeUpdate={handleVideoTimeUpdate}
                    onLoadedMetadata={handleVideoLoadedMetadata}
                  />

                  {/* Play/Pause overlay */}
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

                  {/* Label */}
                  <div className="absolute top-2 left-2 flex items-center gap-2">
                    <div className="px-2 py-0.5 rounded bg-blue-500/80 text-xs font-medium text-white flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      Vidéo générée
                    </div>
                    {/* Video prompt button */}
                    {plan?.video_prompt && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowVideoPrompt(!showVideoPrompt);
                        }}
                        className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium transition-all flex items-center gap-1',
                          showVideoPrompt
                            ? 'bg-purple-500 text-white'
                            : 'bg-black/60 text-slate-300 opacity-0',
                          isVideoHovered && 'opacity-100'
                        )}
                        title="Voir le prompt vidéo"
                      >
                        <FileText className="w-3 h-3" />
                        Prompt
                      </button>
                    )}
                  </div>

                  {/* Video prompt display panel */}
                  {showVideoPrompt && plan?.video_prompt && (
                    <div
                      className="absolute top-10 left-2 right-2 bg-black/90 backdrop-blur-sm rounded-lg p-3 z-20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            <FileText className="w-3 h-3 text-purple-400" />
                            <span className="text-xs font-medium text-purple-300">Prompt vidéo</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed max-h-24 overflow-y-auto">
                            {plan.video_prompt}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={handleCopyVideoPrompt}
                            className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                            title="Copier le prompt"
                          >
                            {copiedVideoPrompt ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-white" />
                            )}
                          </button>
                          <button
                            onClick={() => setShowVideoPrompt(false)}
                            className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition-colors"
                            title="Fermer"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Controls */}
                  <div className={cn(
                    'absolute top-2 right-2 flex items-center gap-2 transition-opacity duration-200',
                    isVideoHovered ? 'opacity-100' : 'opacity-0'
                  )}>
                    <button
                      onClick={handleDownloadVideo}
                      className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                    <button
                      onClick={() => setIsFullscreen(true)}
                      className="w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                    >
                      <Maximize2 className="w-4 h-4 text-white" />
                    </button>
                  </div>

                  {/* Progress bar */}
                  <div className={cn(
                    'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200',
                    isVideoHovered ? 'opacity-100' : 'opacity-0'
                  )}>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-white/70 w-10 text-right font-mono">
                        {formatTime(currentTime)}
                      </span>
                      <div className="flex-1 relative h-1 group/slider">
                        <input
                          type="range"
                          min={0}
                          max={videoDuration || 100}
                          step={0.1}
                          value={currentTime}
                          onChange={handleSliderChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="absolute inset-0 bg-white/20 rounded-full" />
                        <div
                          className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: videoDuration ? `${(currentTime / videoDuration) * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="text-xs text-white/70 w-10 font-mono">
                        {formatTime(videoDuration)}
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
                )}
              </div>
            ) : (
              /* Frames + Prompt view - Universal layout: Frames on top, Prompt on bottom */
              <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                {/* TOP: Frames side by side */}
                <div className="flex-shrink-0 flex items-center justify-center gap-6">
                  {/* Frame In */}
                  <FrameEditor
                    type="in"
                    imageUrl={plan.storyboard_image_url || plan.first_frame_url}
                    prompt={plan.first_frame_prompt || plan.storyboard_prompt}
                    width={frameStyle.width}
                    height={frameStyle.height}
                    onOpenGallery={() => openGalleryPicker('in')}
                    onOpenBible={() => openBiblePicker('in')}
                    onGenerate={() => openSceneGenerator('in')}
                    onDownload={() => handleDownloadFrame('in')}
                    onClear={() => handleClearFrame('in')}
                    canLinkPrevious={hasPreviousFrame}
                    onLinkPrevious={copyFromPreviousPlan}
                    willExtractFromVideo={willExtractFromVideo}
                    isLinking={isExtractingFrame}
                  />

                  {/* Arrow / Duration indicator */}
                  <div className="flex flex-col items-center gap-1 text-slate-500">
                    <Video className="w-6 h-6" />
                    <span className="text-xs font-medium">{plan.duration}s</span>
                  </div>

                  {/* Frame Out */}
                  {showFrameOut && (
                    <FrameEditor
                      type="out"
                      imageUrl={plan.last_frame_url}
                      prompt={plan.last_frame_prompt}
                      width={frameStyle.width}
                      height={frameStyle.height}
                      onOpenGallery={() => openGalleryPicker('out')}
                      onOpenBible={() => openBiblePicker('out')}
                      onGenerate={() => openSceneGenerator('out')}
                      onDownload={() => handleDownloadFrame('out')}
                      onClear={() => handleClearFrame('out')}
                    />
                  )}
                </div>

                {/* BOTTOM: Prompt Panel */}
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex-1 bg-slate-900/95 backdrop-blur border border-blue-500/30 rounded-xl p-4 shadow-2xl flex flex-col overflow-hidden">
                    {/* Animation Prompt */}
                    <div className={cn(
                      'flex flex-col min-h-0',
                      config.showDialogue && hasDialogue ? 'flex-[2]' : 'flex-1'
                    )}>
                      <Label className="text-blue-400 text-xs mb-1 block flex-shrink-0">
                        Animation Prompt
                      </Label>
                      <div className="flex-1 min-h-0">
                        <MentionInput
                          value={animationPrompt}
                          onChange={handleAnimationPromptChange}
                          placeholder="Décrivez l'animation... (@Personnage #Lieu)"
                          projectId={projectId}
                          minHeight="80px"
                          className="h-full"
                        />
                      </div>
                    </div>

                    {/* Dialogue section (video-free mode only) */}
                    {config.showDialogue && (
                      <div
                        className={cn(
                          'border-t border-white/10 pt-3 mt-3',
                          hasDialogue ? 'flex-1 flex flex-col min-h-0' : 'flex-shrink-0'
                        )}
                      >
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
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-7 text-xs w-32">
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
                                const newAudioMode = newValue ? 'dialogue' : 'mute';
                                setAudioMode(newAudioMode);
                                onUpdate({ has_dialogue: newValue, audio_mode: newAudioMode });
                              }}
                              className={cn(
                                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                                hasDialogue ? 'bg-blue-500' : 'bg-slate-600'
                              )}
                            >
                              <span
                                className={cn(
                                  'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform',
                                  hasDialogue ? 'translate-x-4' : 'translate-x-0'
                                )}
                              />
                            </button>
                          </div>
                        </div>
                        {hasDialogue && (
                          <div className="flex-1 mt-2 min-h-0">
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
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Gallery Picker */}
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

        {/* Bible Picker */}
        <ProjectBiblePicker
          open={showBiblePicker}
          onOpenChange={(open) => {
            setShowBiblePicker(open);
            if (!open) setPickingFrame(null);
          }}
          projectId={projectId}
          onSelect={(url) => handleImageSelect(url)}
          title={`Bible - Frame ${pickingFrame === 'in' ? 'In' : 'Out'}`}
        />

      </DialogContent>

      {/* Fullscreen Video */}
      {isFullscreen && signedVideoUrl && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={handleDownloadVideo}
            className="absolute top-4 right-20 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
          >
            <Download className="w-5 h-5 text-white" />
          </button>

          <div className="relative w-full h-full flex items-center justify-center group">
            <video
              src={signedVideoUrl}
              autoPlay
              loop
              controls={false}
              className="max-w-full max-h-full object-contain cursor-pointer"
              onClick={(e) => {
                const video = e.currentTarget;
                if (video.paused) video.play();
                else video.pause();
              }}
            />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-sm">
              Appuie sur Échap pour fermer
            </div>
          </div>
        </div>,
        document.body
      )}
    </Dialog>

    {/* Scene Generator (QuickShot with Bible integration) - Outside main dialog */}
    {showSceneGenerator && (
      <Dialog open={showSceneGenerator} onOpenChange={(open) => {
        setShowSceneGenerator(open);
        if (!open) setGeneratingFrame(null);
      }}>
        <DialogContent
          className={cn(
            'max-w-[90vw] w-[90vw] h-[85vh] max-h-[85vh]',
            'flex flex-col p-0 gap-0',
            'bg-[#0a0e12] border-white/10',
            '[&>button]:hidden',
            'z-[200]'
          )}
        >
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-white/10 bg-[#0f1419]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-white">
                  Générer {generatingFrame === 'in' ? 'Frame In' : 'Frame Out'}
                </DialogTitle>
                <p className="text-sm text-slate-400">
                  Utilisez @Personnage #Lieu !Look pour créer une scène
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="border-white/10 text-slate-300 hover:bg-white/5"
              onClick={() => {
                setShowSceneGenerator(false);
                setGeneratingFrame(null);
              }}
            >
              Fermer
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <QuickShotGenerator
            projectId={projectId}
            defaultAspectRatio={aspectRatio}
            onShotsGenerated={handleGeneratedShots}
            onImageSelected={handleImageSelected}
            lockAspectRatio={true}
            showPlaceholders={true}
            mode="multi"
            title=""
            description=""
          />
        </div>
      </DialogContent>
    </Dialog>
    )}
  </>
  );
}

export default PlanEditor;
