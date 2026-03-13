'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Upload, Music, Mic, Volume2, Loader2, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AudioAssetType } from '@/types/audio';

interface AudioUploaderProps {
  projectId: string;
  onUploadComplete?: (audioAsset: any) => void;
  onCancel?: () => void;
  isMaster?: boolean;
  className?: string;
}

const AUDIO_TYPES: { value: AudioAssetType; label: string; icon: typeof Music }[] = [
  { value: 'music', label: 'Musique', icon: Music },
  { value: 'voice', label: 'Voix / Vocals', icon: Mic },
  { value: 'dialogue', label: 'Dialogue', icon: Mic },
  { value: 'sfx', label: 'Effets sonores', icon: Volume2 },
  { value: 'ambiance', label: 'Ambiance', icon: Volume2 },
];

export function AudioUploader({
  projectId,
  onUploadComplete,
  onCancel,
  isMaster = false,
  className,
}: AudioUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<AudioAssetType>('music');
  const [duration, setDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac'];
    if (!allowedTypes.includes(selectedFile.type)) {
      toast.error('Type de fichier non supporté. Utilisez MP3, WAV, OGG, M4A ou AAC.');
      return;
    }

    // Validate file size (max 100MB)
    if (selectedFile.size > 100 * 1024 * 1024) {
      toast.error('Fichier trop volumineux. Maximum 100MB.');
      return;
    }

    setFile(selectedFile);
    setName(selectedFile.name.replace(/\.[^/.]+$/, '')); // Remove extension

    // Get duration using audio element
    const audio = audioRef.current;
    if (audio) {
      audio.src = URL.createObjectURL(selectedFile);
      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name || file.name);
      formData.append('type', type);
      formData.append('duration', duration.toString());
      formData.append('is_master', isMaster.toString());

      // Simulate progress (actual XHR would have real progress)
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch(`/api/projects/${projectId}/audio`, {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      toast.success('Audio uploadé avec succès');
      onUploadComplete?.(data.audioAsset);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(String(error));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Simulate file input change
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileSelect({ target: fileInputRef.current } as any);
      }
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Hidden audio element for duration detection */}
      <audio ref={audioRef} className="hidden" />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!file ? (
        // Drop zone
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors"
        >
          <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
          <p className="text-sm text-slate-300 mb-1">
            Glissez-déposez un fichier audio
          </p>
          <p className="text-xs text-slate-500">
            ou cliquez pour sélectionner (MP3, WAV, OGG, M4A - max 100MB)
          </p>
        </div>
      ) : (
        // File selected - configuration form
        <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-white/10">
          {/* File info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-slate-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB • {Math.floor(duration / 60)}:{Math.floor(duration % 60).toString().padStart(2, '0')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setFile(null)}
              disabled={uploading}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="audio-name">Nom</Label>
            <Input
              id="audio-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de l'audio"
              disabled={uploading}
            />
          </div>

          {/* Type select */}
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AudioAssetType)} disabled={uploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIO_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      <t.icon className="w-4 h-4" />
                      {t.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Master indicator */}
          {isMaster && (
            <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 rounded-md px-3 py-2">
              <Check className="w-4 h-4" />
              Cet audio sera défini comme audio principal du projet
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-center text-slate-400">
                Upload en cours... {progress}%
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={uploading}
            >
              Annuler
            </Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !name}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Upload...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Uploader
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AudioUploader;
