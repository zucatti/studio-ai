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
import type { Project } from '@/types/database';
import { Sparkles, Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editProject?: Project | null;
  onSubmit: (name: string, description?: string, thumbnailUrl?: string) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  editProject,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
      setExistingThumbnailUrl(editProject.thumbnail_url || null);
      setThumbnailPreview(editProject.thumbnail_url || null);
      setThumbnailFile(null);
    } else if (!open) {
      setName('');
      setDescription('');
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

      await onSubmit(name.trim(), description.trim() || undefined, thumbnailUrl);
      setName('');
      setDescription('');
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
