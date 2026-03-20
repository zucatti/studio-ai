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
import type { Project, AspectRatio, ProjectType } from '@/types/database';
import { getProjectTypeConfig, getAspectRatiosForType } from '@/lib/project-types';
import { Sparkles, Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROJECT_TYPE_ICONS } from '@/components/icons/project-type-icons';

// Compact project types config
const COMPACT_PROJECT_TYPES: { value: ProjectType; label: string; simplified: boolean }[] = [
  { value: 'movie', label: 'Film', simplified: false },
  { value: 'short', label: 'Court-métrage', simplified: false },
  { value: 'music_video', label: 'Clip', simplified: false },
  { value: 'shorts_project', label: 'Shorts', simplified: true },
  { value: 'portfolio', label: 'Portfolio', simplified: true },
];

// Aspect ratio configuration with SVG icons
const ALL_ASPECT_RATIOS: {
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
    description: 'Carré',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="22" height="22" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
  {
    value: '4:5',
    label: '4:5',
    description: 'Portrait (Instagram)',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 20 25" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="23" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
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
  {
    value: '2:3',
    label: '2:3',
    description: 'Portrait photo',
    icon: ({ className }) => (
      <svg className={className} viewBox="0 0 20 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="18" height="28" rx="2" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1"/>
      </svg>
    ),
  },
];

interface FocalPoint {
  x: number;
  y: number;
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: Project | null;
  onSubmit: (name: string, description?: string, thumbnailUrl?: string, aspectRatio?: AspectRatio, projectType?: ProjectType, focalPoint?: FocalPoint) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  editProject,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('short');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<string | null>(null);
  const [focalPoint, setFocalPoint] = useState<FocalPoint>({ x: 50, y: 25 });
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  const isEditing = !!editProject;

  useEffect(() => {
    if (open && editProject) {
      setName(editProject.name);
      setDescription(editProject.description || '');
      setProjectType(editProject.project_type || 'short');
      setAspectRatio(editProject.aspect_ratio || '16:9');
      setExistingThumbnailUrl(editProject.thumbnail_url || null);
      setThumbnailPreview(editProject.thumbnail_url || null);
      setThumbnailFile(null);
      setFocalPoint(editProject.thumbnail_focal_point || { x: 50, y: 25 });
    } else if (!open) {
      setName('');
      setDescription('');
      setProjectType('short');
      setAspectRatio('16:9');
      setThumbnailPreview(null);
      setThumbnailFile(null);
      setExistingThumbnailUrl(null);
      setFocalPoint({ x: 50, y: 25 });
    }
  }, [open, editProject]);

  // Update aspect ratio when project type changes (only for new projects)
  useEffect(() => {
    if (isEditing) return; // Don't change ratio when editing
    const config = getProjectTypeConfig(projectType);
    // Always set the default ratio for the type when creating new project
    setAspectRatio(config.defaultRatio);
  }, [projectType, isEditing]);

  // Get filtered aspect ratios for current project type
  const availableAspectRatios = ALL_ASPECT_RATIOS.filter((r) =>
    getAspectRatiosForType(projectType).includes(r.value)
  );

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

  const handleFocalPointClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!thumbnailContainerRef.current) return;
    const rect = thumbnailContainerRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setFocalPoint({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
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

      await onSubmit(name.trim(), description.trim() || undefined, thumbnailUrl, aspectRatio, projectType, focalPoint);
      setName('');
      setDescription('');
      setProjectType('short');
      setAspectRatio('16:9');
      setThumbnailPreview(null);
      setThumbnailFile(null);
      setExistingThumbnailUrl(null);
      setFocalPoint({ x: 50, y: 25 });
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
      <DialogContent className="sm:max-w-[850px] bg-gradient-to-br from-[#1a2e44] to-[#152238] border-white/10">
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

          <div className="grid gap-4 py-4">
            {/* Thumbnail Upload */}
            <div className="grid gap-2">
              <Label className="text-slate-300">
                Image de couverture{' '}
                <span className="text-slate-500 font-normal">(optionnelle)</span>
              </Label>

              {displayPreview ? (
                <div className="space-y-1.5">
                  <div className="relative group">
                    <div
                      ref={thumbnailContainerRef}
                      onClick={handleFocalPointClick}
                      className="h-44 rounded-xl overflow-hidden border border-white/10 bg-[#0d1829] cursor-crosshair relative"
                    >
                      <StorageImg
                        src={displayPreview}
                        alt="Aperçu"
                        className="w-full h-full object-cover"
                        style={{ objectPosition: `${focalPoint.x}% ${focalPoint.y}%` }}
                      />
                      {/* Focal point indicator */}
                      <div
                        className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ left: `${focalPoint.x}%`, top: `${focalPoint.y}%` }}
                      >
                        <div className="absolute inset-0 rounded-full border-2 border-white shadow-lg" />
                        <div className="absolute inset-[6px] rounded-full bg-blue-500" />
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        className="bg-black/60 hover:bg-black/80 text-white border-0 h-7 px-2 text-xs backdrop-blur-sm"
                      >
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        Changer
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); removeThumbnail(); }}
                        className="bg-red-500/60 hover:bg-red-500/80 text-white border-0 h-7 px-2 text-xs backdrop-blur-sm"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 text-center">
                    Cliquez pour définir le point focal
                  </p>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  className={`
                    h-40 rounded-xl border-2 border-dashed cursor-pointer
                    flex flex-col items-center justify-center gap-2 transition-all duration-200
                    ${isDragging
                      ? 'border-blue-400 bg-blue-500/10'
                      : 'border-white/10 hover:border-blue-400/50 hover:bg-white/5 bg-[#0d1829]/50'
                    }
                  `}
                >
                  <ImageIcon className={`w-8 h-8 ${isDragging ? 'text-blue-400' : 'text-slate-500'}`} />
                  <div className="text-center">
                    <p className={`text-sm ${isDragging ? 'text-blue-400' : 'text-slate-400'}`}>
                      {isDragging ? 'Déposez ici' : 'Cliquez ou glissez-déposez'}
                    </p>
                    <p className="text-[10px] text-slate-600">PNG, JPG, WebP (max. 5MB)</p>
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

            {/* Project Type - only show when creating */}
            {!isEditing && (
              <div className="grid gap-2">
                <Label className="text-slate-300">Type de projet</Label>
                <div className="flex rounded-lg border border-white/10 bg-[#0d1829]/50 p-1 gap-1">
                  {COMPACT_PROJECT_TYPES.map((type) => {
                    const isSelected = projectType === type.value;
                    const IconComponent = PROJECT_TYPE_ICONS[type.value];
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setProjectType(type.value)}
                        title={type.simplified ? 'Quick Shot' : 'Pipeline complet'}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap',
                          isSelected
                            ? 'bg-blue-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-white/5'
                        )}
                      >
                        <IconComponent className="w-4 h-4 flex-shrink-0" />
                        <span className="hidden sm:inline">{type.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500">
                  {getProjectTypeConfig(projectType).simplified
                    ? 'Mode Quick Shot : génération rapide d\'images'
                    : 'Pipeline complet : brainstorming → script → storyboard'
                  }
                </p>
              </div>
            )}

            {/* Aspect Ratio */}
            <div className="grid gap-2">
              <Label className="text-slate-300">Format</Label>
              <div className="flex flex-wrap gap-1.5">
                {availableAspectRatios.map((ratio) => {
                  const isSelected = aspectRatio === ratio.value;
                  const IconComponent = ratio.icon;
                  return (
                    <button
                      key={ratio.value}
                      type="button"
                      onClick={() => setAspectRatio(ratio.value)}
                      title={ratio.description}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all duration-200',
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-white/10 hover:border-white/20 hover:bg-white/5 text-slate-400'
                      )}
                    >
                      <IconComponent className="h-4 w-auto" />
                      <span className={cn('text-xs font-medium', isSelected && 'text-white')}>
                        {ratio.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label htmlFor="description" className="text-slate-300">
                Description{' '}
                <span className="text-slate-500 font-normal">(optionnelle)</span>
              </Label>
              <Textarea
                id="description"
                placeholder="Une brève description de votre projet..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
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
