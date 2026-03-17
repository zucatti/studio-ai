'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StorageImg } from '@/components/ui/storage-image';
import type { Project, AspectRatio } from '@/types/database';
import { Sparkles, Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';

// Aspect ratio configuration with SVG icons
const ASPECT_RATIOS: {
  value: AspectRatio;
  label: string;
  description: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  {
    value: '16:9',
    label: '16:9',
    description: 'Paysage (YouTube, TV)',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 32 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="30" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
  {
    value: '9:16',
    label: '9:16',
    description: 'Portrait (TikTok, Reels)',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 18 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="16" height="30" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
  {
    value: '1:1',
    label: '1:1',
    description: 'Carré (Instagram)',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="22" height="22" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
  {
    value: '21:9',
    label: '21:9',
    description: 'Cinémascope',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 42 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="40" height="16" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
];

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: Project | null;
  onSubmit: (name: string, description?: string, thumbnailUrl?: string, aspectRatio?: AspectRatio) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  editProject,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editProject;

  useEffect(() => {
    if (open && editProject) {
      setName(editProject.name);
      setDescription(editProject.description || '');
      setAspectRatio(editProject.aspect_ratio || '16:9');
      setExistingThumbnailUrl(editProject.thumbnail_url || null);
      setThumbnailPreview(editProject.thumbnail_url || null);
      setThumbnailFile(null);
    } else if (!open) {
      setName('');
      setDescription('');
      setAspectRatio('16:9');
      setThumbnailPreview(null);
      setThumbnailFile(null);
      setExistingThumbnailUrl(null);
    }
  }, [open, editProject]);

  const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Use high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not create blob'));
            }
          },
          'image/jpeg',
          0.85 // Quality 85%
        );
      };
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange = async (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      // Validate size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('L\'image est trop volumineuse. Maximum: 5MB');
        return;
      }

      try {
        // Resize image to max 1280x720 (HD thumbnail)
        const resizedBlob = await resizeImage(file, 1280, 720);
        const resizedFile = new File([resizedBlob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
          type: 'image/jpeg',
        });

        setThumbnailFile(resizedFile);
        const reader = new FileReader();
        reader.onload = (e) => {
          setThumbnailPreview(e.target?.result as string);
        };
        reader.readAsDataURL(resizedBlob);
      } catch (error) {
        console.error('Error resizing image:', error);
        // Fallback: use original file
        setThumbnailFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setThumbnailPreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    void handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'project-thumbnails');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);

    try {
      let thumbnailUrl: string | undefined = existingThumbnailUrl || undefined;

      // Upload new image if selected
      if (thumbnailFile) {
        setIsUploading(true);
        const uploadedUrl = await uploadImage(thumbnailFile);
        setIsUploading(false);

        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
        }
      } else if (!thumbnailPreview && existingThumbnailUrl) {
        // Image was removed
        thumbnailUrl = undefined;
      }

      await onSubmit(name.trim(), description.trim() || undefined, thumbnailUrl, aspectRatio);
      setName('');
      setDescription('');
      setAspectRatio('16:9');
      setThumbnailPreview(null);
      setThumbnailFile(null);
      setExistingThumbnailUrl(null);
    } finally {
      setIsLoading(false);
      setIsUploading(false);
    }
  };

  const removeThumbnail = () => {
    setThumbnailPreview(null);
    setThumbnailFile(null);
    setExistingThumbnailUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayPreview = thumbnailPreview;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] bg-gradient-to-br from-[#1a2e44] to-[#152238] border-white/10">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-xl text-white flex items-center gap-2">
              {isEditing ? (
                'Modifier le projet'
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  Nouveau projet
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {isEditing
                ? 'Modifiez les informations de votre projet.'
                : 'Créez un nouveau projet de production vidéo IA.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-6">
            {/* Thumbnail Upload */}
            <div className="grid gap-2">
              <Label className="text-slate-300">
                Image de couverture{' '}
                <span className="text-slate-500 font-normal">(optionnelle)</span>
              </Label>

              {displayPreview ? (
                <div className="relative group">
                  <div className="aspect-video rounded-xl overflow-hidden border border-white/10 bg-[#0d1829]">
                    <StorageImg
                      src={displayPreview}
                      alt="Aperçu"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-white/10 hover:bg-white/20 text-white border-0"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Changer
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={removeThumbnail}
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border-0"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Supprimer
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`
                    aspect-video rounded-xl border-2 border-dashed cursor-pointer
                    flex flex-col items-center justify-center gap-3 transition-all duration-200
                    ${isDragging
                      ? 'border-blue-400 bg-blue-500/10'
                      : 'border-white/10 hover:border-blue-400/50 hover:bg-white/5 bg-[#0d1829]/50'
                    }
                  `}
                >
                  <div className={`
                    w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
                    ${isDragging ? 'bg-blue-500/20' : 'bg-white/5'}
                  `}>
                    <ImageIcon className={`w-7 h-7 ${isDragging ? 'text-blue-400' : 'text-slate-500'}`} />
                  </div>
                  <div className="text-center">
                    <p className={`text-sm font-medium ${isDragging ? 'text-blue-400' : 'text-slate-400'}`}>
                      {isDragging ? 'Déposez l\'image ici' : 'Cliquez ou glissez-déposez'}
                    </p>
                    <p className="text-xs text-slate-600 mt-1">
                      PNG, JPG ou WebP (max. 5MB)
                    </p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
            </div>

            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-slate-300">
                Nom du projet
              </Label>
              <Input
                id="name"
                placeholder="Mon court-métrage"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-white/10"
              />
            </div>

            {/* Aspect Ratio */}
            <div className="grid gap-2">
              <Label className="text-slate-300">Format vidéo</Label>
              <div className="grid grid-cols-4 gap-2">
                {ASPECT_RATIOS.map((ratio) => {
                  const isSelected = aspectRatio === ratio.value;
                  const IconComponent = ratio.icon;
                  return (
                    <button
                      key={ratio.value}
                      type="button"
                      onClick={() => setAspectRatio(ratio.value)}
                      className={`
                        group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200
                        ${isSelected
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                        }
                      `}
                    >
                      <div className={`
                        flex items-center justify-center h-8
                        ${isSelected ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-300'}
                      `}>
                        <IconComponent className="h-full w-auto" />
                      </div>
                      <div className="text-center">
                        <div className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {ratio.label}
                        </div>
                        <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                          {ratio.description}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description" className="text-slate-300">
                Description{' '}
                <span className="text-slate-500 font-normal">(optionnelle)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Une brève description de votre projet..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-blue-500/50 focus:bg-white/10 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white hover:bg-white/5"
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25 min-w-[140px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUploading ? 'Upload...' : 'Création...'}
                </>
              ) : isEditing ? (
                'Enregistrer'
              ) : (
                'Créer le projet'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
