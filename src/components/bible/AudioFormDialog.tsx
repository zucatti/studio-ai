'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { GlobalAsset } from '@/types/database';
import type { AudioData, AudioType } from '@/store/bible-store';
import { useSignedUrl } from '@/hooks/use-signed-url';
import {
  Music,
  Upload,
  Loader2,
  Save,
  Volume2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Mic,
  Waves,
  Radio,
  Headphones,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AudioFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audio?: GlobalAsset | null;
  onSuccess?: (audio: GlobalAsset) => void;
}

// Audio type configuration
const AUDIO_TYPES: {
  value: AudioType;
  label: string;
  icon: typeof Music;
  description: string;
}[] = [
  { value: 'music', label: 'Musique', icon: Music, description: 'Musique de fond, thèmes' },
  { value: 'sfx', label: 'SFX', icon: Waves, description: 'Effets sonores' },
  { value: 'ambiance', label: 'Ambiance', icon: Radio, description: 'Sons d\'ambiance' },
  { value: 'foley', label: 'Foley', icon: Headphones, description: 'Bruitages' },
  { value: 'dialogue', label: 'Dialogue', icon: Mic, description: 'Voix, dialogues' },
  { value: 'voiceover', label: 'Voix-off', icon: Volume2, description: 'Narration' },
];

// Format duration as mm:ss
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AudioFormDialog({
  open,
  onOpenChange,
  audio,
  onSuccess,
}: AudioFormDialogProps) {
  const isEditing = !!audio;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audioType, setAudioType] = useState<AudioType>('music');
  const [tags, setTags] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [fileSize, setFileSize] = useState<number>(0);
  const [format, setFormat] = useState<string>('');

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Get signed URL for playback (b2:// URLs need signing)
  const { signedUrl: playbackUrl, isLoading: isLoadingUrl } = useSignedUrl(fileUrl);

  // Initialize form when audio changes
  useEffect(() => {
    if (audio) {
      const data = audio.data as AudioData | undefined;
      setName(audio.name);
      setDescription(data?.description || '');
      setAudioType(data?.audioType || 'music');
      setTags(audio.tags?.join(', ') || '');
      setFileUrl(data?.fileUrl || null);
      setFileName(data?.fileName || null);
      setDuration(data?.duration || 0);
      setFileSize(data?.fileSize || 0);
      setFormat(data?.format || '');
    } else {
      setName('');
      setDescription('');
      setAudioType('music');
      setTags('');
      setFileUrl(null);
      setFileName(null);
      setDuration(0);
      setFileSize(0);
      setFormat('');
    }
    setIsPlaying(false);
    setCurrentTime(0);
  }, [audio, open]);

  // Audio player event handlers
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handleTimeUpdate = () => {
      if (!isSeeking) {
        setCurrentTime(audioEl.currentTime);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleLoadedMetadata = () => {
      if (audioEl.duration && !isNaN(audioEl.duration)) {
        setDuration(audioEl.duration);
      }
    };

    audioEl.addEventListener('timeupdate', handleTimeUpdate);
    audioEl.addEventListener('ended', handleEnded);
    audioEl.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      audioEl.removeEventListener('timeupdate', handleTimeUpdate);
      audioEl.removeEventListener('ended', handleEnded);
      audioEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isSeeking]);

  const togglePlay = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (isPlaying) {
      audioEl.pause();
    } else {
      audioEl.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const skipTime = (seconds: number) => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    audioEl.currentTime = Math.max(0, Math.min(duration, audioEl.currentTime + seconds));
  };

  const handleUploadAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
      toast.error('Format audio non supporté. Utilisez MP3, WAV, OGG, M4A ou AAC.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'project-assets');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setFileUrl(data.url);
        setFileName(file.name);
        setFileSize(file.size);

        // Extract format from file extension
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        setFormat(ext);

        // Auto-fill name if empty
        if (!name) {
          const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
          setName(nameWithoutExt);
        }

        toast.success('Fichier audio uploadé');
      } else {
        toast.error('Erreur lors de l\'upload');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeFile = () => {
    setFileUrl(null);
    setFileName(null);
    setDuration(0);
    setFileSize(0);
    setFormat('');
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    if (!fileUrl) {
      toast.error('Veuillez uploader un fichier audio');
      return;
    }

    setIsSaving(true);
    try {
      const tagArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const payload = {
        name: name.trim(),
        asset_type: 'audio',
        data: {
          description,
          audioType,
          fileUrl,
          fileName,
          duration,
          fileSize,
          format,
        } as AudioData,
        tags: tagArray,
        reference_images: [],
      };

      const url = audio?.id ? `/api/global-assets/${audio.id}` : '/api/global-assets';
      const method = audio?.id ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(audio?.id ? 'Audio mis à jour' : 'Audio créé');
        onSuccess?.(data.asset);
        onOpenChange(false);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving audio:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-[#0d1117] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-slate-700/50">
              <Music className="w-4 h-4 text-blue-400" />
            </div>
            {isEditing ? 'Modifier l\'audio' : 'Nouvel audio'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Audio Player / Upload Zone */}
          <div>
            {fileUrl ? (
              <div className="relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 rounded-lg p-3 border border-white/10">
                {/* Hidden audio element */}
                {playbackUrl && <audio ref={audioRef} src={playbackUrl} preload="metadata" />}

                {/* File info header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center">
                      <Music className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white truncate max-w-[200px]">
                        {fileName}
                      </p>
                      <p className="text-xs text-slate-400">
                        {format.toUpperCase()} • {formatFileSize(fileSize)} • {formatDuration(duration)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={removeFile}
                    className="text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Compact player with progress bar */}
                <div className="flex items-center gap-3">
                  {/* Play button */}
                  <Button
                    onClick={togglePlay}
                    disabled={isLoadingUrl || !playbackUrl}
                    size="sm"
                    className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 p-0"
                  >
                    {isLoadingUrl ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isPlaying ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </Button>

                  {/* Progress bar */}
                  <div className="flex-1 relative">
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={currentTime}
                      onChange={handleSeek}
                      onMouseDown={() => setIsSeeking(true)}
                      onMouseUp={() => setIsSeeking(false)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>

                  {/* Time */}
                  <span className="text-xs text-slate-400 tabular-nums w-16 text-right">
                    {formatDuration(currentTime)} / {formatDuration(duration)}
                  </span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                  'border-white/10 hover:border-blue-500/50 hover:bg-slate-800/50'
                )}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <p className="text-sm text-slate-400">Upload en cours...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        Cliquez pour uploader
                      </p>
                      <p className="text-xs text-slate-500">
                        MP3, WAV, OGG, M4A
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac"
              onChange={handleUploadAudio}
              className="hidden"
            />
          </div>

          {/* Audio Type Selection - Connected group buttons */}
          <div className="space-y-2.5">
            <Label className="text-slate-300 text-xs">Type</Label>
            <div className="inline-flex rounded-lg bg-slate-800/50 p-0.5">
              {AUDIO_TYPES.map((type, index) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setAudioType(type.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-all',
                    index === 0 && 'rounded-l-md',
                    index === AUDIO_TYPES.length - 1 && 'rounded-r-md',
                    audioType === type.value
                      ? 'bg-slate-700 text-blue-300 rounded-md shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Name & Description in a more compact layout */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="audio-name" className="text-slate-300 text-xs">
                Nom <span className="text-red-400">*</span>
              </Label>
              <Input
                id="audio-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Ambiance forêt..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audio-tags" className="text-slate-300 text-xs">
                Tags
              </Label>
              <Input
                id="audio-tags"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="nature, calme..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 h-9"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="audio-description" className="text-slate-300 text-xs">
              Description
            </Label>
            <Textarea
              id="audio-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Décrivez cet audio..."
              rows={2}
              className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-slate-300 hover:text-white"
          >
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !name.trim() || !fileUrl}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-1" />
                {isEditing ? 'Modifier' : 'Créer'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
