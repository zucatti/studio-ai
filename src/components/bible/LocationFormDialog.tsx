'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { StorageImg } from '@/components/ui/storage-image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GlobalAsset } from '@/types/database';
import { MapPin, Upload, Loader2, Save, Wand2, ImageIcon, X, ImagePlus, Download, Images, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useJobsStore, type GenerationJob } from '@/store/jobs-store';

interface LocationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: GlobalAsset | null;
  onSuccess?: (location: GlobalAsset) => void;
}

interface LocationData {
  description?: string;
  visual_description?: string;
  int_ext?: 'INT' | 'EXT' | 'INT/EXT';
  rushes?: RushImage[];
  reference_images_metadata?: ReferenceImage[];
  [key: string]: unknown; // Allow other properties to be preserved
}

interface ReferenceImage {
  url: string;
  type: string;
  label: string;
}

interface RushImage {
  url: string;
  type: string;
  label: string;
  createdAt: string;
}

const MAX_RUSHES = 8;

const INT_EXT_OPTIONS = [
  { value: 'INT', label: 'Intérieur' },
  { value: 'EXT', label: 'Extérieur' },
  { value: 'INT/EXT', label: 'Int/Ext' },
];

const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const;

const ASPECT_RATIO_OPTIONS = [
  { value: '16:9', label: '16:9' },
  { value: '3:4', label: '3:4' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
] as const;

// Text-to-image models
const MODEL_OPTIONS = [
  { value: 'fal-ai/nano-banana-2', label: 'Nano Banana 2' },
  { value: 'seedream-5', label: 'Seedream 5' },
  { value: 'gpt-image-1.5', label: 'GPT 4.5' },
  { value: 'flux-2-pro', label: 'Flux Pro' },
] as const;

// Image-to-image models (when inspiration images are present)
const I2I_MODEL_OPTIONS = [
  { value: 'kling-omni', label: 'Kling O1' },
  { value: 'flux-i2i', label: 'Flux Dev' },
  { value: 'seedream-edit', label: 'Seedream Edit' },
] as const;

type ResolutionType = typeof RESOLUTION_OPTIONS[number]['value'];
type ModelType = typeof MODEL_OPTIONS[number]['value'];
type I2IModelType = typeof I2I_MODEL_OPTIONS[number]['value'];
type AspectRatioType = typeof ASPECT_RATIO_OPTIONS[number]['value'];

export function LocationFormDialog({
  open,
  onOpenChange,
  location,
  onSuccess,
}: LocationFormDialogProps) {
  const isEditing = !!location;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [visualDescription, setVisualDescription] = useState('');
  const [intExt, setIntExt] = useState<'INT' | 'EXT' | 'INT/EXT'>('INT');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [rushes, setRushes] = useState<RushImage[]>([]);
  const [referenceImagesMetadata, setReferenceImagesMetadata] = useState<ReferenceImage[]>([]);
  const [showRushes, setShowRushes] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<ResolutionType>('2K');
  const [selectedModel, setSelectedModel] = useState<ModelType>('fal-ai/nano-banana-2');
  const [selectedI2IModel, setSelectedI2IModel] = useState<I2IModelType>('kling-omni');
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatioType>('16:9');
  const [inspirationImages, setInspirationImages] = useState<string[]>([]);
  const [isDraggingInspiration, setIsDraggingInspiration] = useState(false);

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [createdLocationId, setCreatedLocationId] = useState<string | null>(null);
  const [isUploadingInspiration, setIsUploadingInspiration] = useState(false);

  // Jobs store for tracking generation progress
  const { jobs, startPolling, fetchJobs } = useJobsStore();

  // Track pending job for this location
  const pendingJob = useMemo((): GenerationJob | null => {
    const locationId = location?.id || createdLocationId;
    if (!locationId) return null;

    return jobs.find(
      (job) =>
        job.asset_id === locationId &&
        job.job_type === 'image' &&
        ['pending', 'queued', 'running'].includes(job.status)
    ) || null;
  }, [jobs, location?.id, createdLocationId]);

  // Initialize form when location changes
  useEffect(() => {
    if (location) {
      const data = location.data as LocationData | undefined;
      setName(location.name);
      setVisualDescription(data?.visual_description || '');
      setIntExt(data?.int_ext || 'INT');

      const existingImage = location.reference_images?.[0] || null;
      setReferenceImage(existingImage);
      setRushes(data?.rushes || []);

      // Migration: if there's an image but no metadata, create it and save to DB
      let metadata = data?.reference_images_metadata || [];
      if (existingImage && metadata.length === 0) {
        metadata = [{
          url: existingImage,
          type: 'front',
          label: 'Image de référence',
        }];
        // Auto-save migration to database
        fetch(`/api/global-assets/${location.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: {
              ...data,
              reference_images_metadata: metadata,
            },
          }),
        }).then(() => {
          console.log('[LocationForm] Migrated reference_images_metadata to database');
        }).catch((err) => {
          console.error('[LocationForm] Failed to migrate metadata:', err);
        });
      }
      setReferenceImagesMetadata(metadata);

      setCreatedLocationId(null);
      setInspirationImages([]);
      setShowRushes(false);
    } else {
      setName('');
      setVisualDescription('');
      setIntExt('INT');
      setReferenceImage(null);
      setRushes([]);
      setReferenceImagesMetadata([]);
      setCreatedLocationId(null);
      setInspirationImages([]);
      setShowRushes(false);
    }
  }, [location, open]);

  // Listen for job completion to update image
  useEffect(() => {
    const locationId = location?.id || createdLocationId;
    if (!locationId || !open) return;

    const handleJobCompleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobId: string;
        assetId: string;
        assetType: string;
        jobType: string;
        jobSubtype: string;
      }>;
      const { assetId, jobType } = customEvent.detail;

      // Check if this job is for our location
      if (assetId !== locationId || jobType !== 'image') return;

      console.log('[LocationForm] Job completed, refreshing image');

      // Fetch updated location data
      const res = await fetch(`/api/global-assets/${locationId}`);
      if (res.ok) {
        const data = await res.json();
        const locationData = data.asset?.data as LocationData | undefined;
        const newImages = data.asset?.reference_images || [];
        const newMetadata = locationData?.reference_images_metadata || [];
        const newRushes = locationData?.rushes || [];

        if (newImages.length > 0) {
          setReferenceImage(newImages[0]);
          toast.success('Image générée avec succès!');
        }

        // Sync metadata from server
        if (newMetadata.length > 0) {
          setReferenceImagesMetadata(newMetadata);
        }

        // Sync rushes from server
        if (newRushes.length > 0) {
          setRushes(newRushes);
        }
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);
    startPolling();
    fetchJobs();

    return () => {
      window.removeEventListener('job-completed', handleJobCompleted);
    };
  }, [location?.id, createdLocationId, open, startPolling, fetchJobs]);

  // Handle inspiration image upload
  const handleInspirationUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, 4 - inspirationImages.length); // Max 4 images
    if (fileArray.length === 0) return;

    setIsUploadingInspiration(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bucket', 'project-assets');

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const { url } = await res.json();
          uploadedUrls.push(url);
        }
      }
      if (uploadedUrls.length > 0) {
        setInspirationImages(prev => [...prev, ...uploadedUrls].slice(0, 4));
        toast.success(`${uploadedUrls.length} image(s) d'inspiration ajoutée(s)`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Erreur lors de l'upload");
    } finally {
      setIsUploadingInspiration(false);
    }
  }, [inspirationImages.length]);

  // Drag & drop handlers for inspiration images
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingInspiration(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingInspiration(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingInspiration(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        handleInspirationUpload(imageFiles);
      }
    }
  }, [handleInspirationUpload]);

  const removeInspirationImage = (index: number) => {
    setInspirationImages(prev => prev.filter((_, i) => i !== index));
  };

  // Promote a rush to be the main image
  const promoteRush = (rush: RushImage) => {
    if (referenceImage) {
      // Move current image to rushes
      const currentAsRush: RushImage = {
        url: referenceImage,
        type: 'front',
        label: 'Image générée',
        createdAt: new Date().toISOString(),
      };
      setRushes(prev => [currentAsRush, ...prev.filter(r => r.url !== rush.url)].slice(0, MAX_RUSHES));
    } else {
      // Just remove from rushes
      setRushes(prev => prev.filter(r => r.url !== rush.url));
    }

    // Update metadata
    setReferenceImagesMetadata(prev => {
      const updated = prev.filter(m => m.type !== 'front');
      updated.push({
        url: rush.url,
        type: 'front',
        label: rush.label || 'Image de référence',
      });
      return updated;
    });

    setReferenceImage(rush.url);
    toast.success('Image promue');
  };

  // Delete a rush
  const deleteRush = (rush: RushImage) => {
    setRushes(prev => prev.filter(r => r.url !== rush.url));
    toast.success('Rush supprimé');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    setIsSaving(true);
    try {
      // Update metadata if reference image changed
      let updatedMetadata = [...referenceImagesMetadata];
      if (referenceImage) {
        const existingIndex = updatedMetadata.findIndex(m => m.type === 'front');
        if (existingIndex >= 0) {
          updatedMetadata[existingIndex] = { ...updatedMetadata[existingIndex], url: referenceImage };
        } else if (!updatedMetadata.some(m => m.url === referenceImage)) {
          // Only add if not already in metadata
          updatedMetadata.push({
            url: referenceImage,
            type: 'front',
            label: 'Image de référence',
          });
        }
      }

      const payload = {
        name: name.trim(),
        asset_type: 'location',
        data: {
          visual_description: visualDescription,
          int_ext: intExt,
          rushes: rushes,
          reference_images_metadata: updatedMetadata,
        },
        reference_images: referenceImage ? [referenceImage] : [],
      };

      // Use existing ID if editing or if location was auto-created during generation
      const existingId = location?.id || createdLocationId;
      const url = existingId ? `/api/global-assets/${existingId}` : '/api/global-assets';
      const method = existingId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(existingId ? 'Lieu mis à jour' : 'Lieu créé');
        onSuccess?.(data.asset);
        onOpenChange(false);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving location:', error);
      toast.error('Erreur de connexion');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        const { url } = await res.json();
        setReferenceImage(url);
        toast.success('Image uploadée');
      } else {
        toast.error("Erreur lors de l'upload");
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error("Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateImage = async () => {
    if (!visualDescription.trim()) {
      toast.error('Ajoutez une description visuelle pour générer');
      return;
    }

    if (!name.trim()) {
      toast.error('Ajoutez un nom pour le lieu');
      return;
    }

    // Use i2i model when inspiration images are present, otherwise use selected model
    const effectiveModel = inspirationImages.length > 0 ? selectedI2IModel : selectedModel;

    setIsGenerating(true);
    try {
      let locationId = location?.id || createdLocationId;

      // If new location, create it first
      if (!locationId) {
        const createRes = await fetch('/api/global-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            asset_type: 'location',
            data: {
              visual_description: visualDescription,
              int_ext: intExt,
            },
            reference_images: [],
          }),
        });

        if (!createRes.ok) {
          const error = await createRes.json();
          toast.error(error.error || 'Erreur lors de la création');
          return;
        }

        const createData = await createRes.json();
        locationId = createData.asset.id;
        setCreatedLocationId(locationId);
      }

      // Now generate the image
      const res = await fetch(`/api/global-assets/${locationId}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate_single',
          style: 'photorealistic',
          viewType: 'front',
          model: effectiveModel,
          resolution: selectedResolution,
          aspectRatio: selectedAspectRatio,
          inspirationImageUrls: inspirationImages.length > 0 ? inspirationImages : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.async && data.jobId) {
          // Fetch the job and add to store for tracking
          const jobRes = await fetch(`/api/jobs/${data.jobId}`);
          if (jobRes.ok) {
            const jobData = await jobRes.json();
            const job = jobData.job;
            if (job) {
              useJobsStore.setState((state) => ({
                jobs: [job, ...state.jobs.filter((j) => j.id !== job.id)],
              }));
              startPolling();
            }
          }
          // Show prompt in toast
          toast.success('Génération ajoutée à la file d\'attente', {
            description: data.optimizedPrompt ? `Prompt: "${data.optimizedPrompt.slice(0, 100)}${data.optimizedPrompt.length > 100 ? '...' : ''}"` : undefined,
            duration: 8000,
          });
          // Also log full prompt to console
          if (data.optimizedPrompt) {
            console.log('[LocationForm] Optimized prompt:', data.optimizedPrompt);
          }
        } else if (data.imageUrls?.length > 0) {
          // Synchronous response (legacy)
          setReferenceImage(data.imageUrls[0]);
          toast.success('Image générée');
        }
      } else {
        const error = await res.json();
        toast.error(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 bg-[#0d1520] border-white/10 overflow-hidden">
        {/* Header with image */}
        <div className="relative">
          {/* Image area */}
          <div className="relative aspect-video bg-slate-900">
            {pendingJob ? (
              <div className="w-full h-full flex flex-col items-center justify-center relative overflow-hidden">
                {/* Rainbow animation background */}
                <div className="absolute inset-0 rainbow-radial-animation" />
                <div className="absolute inset-0 bg-black/40" />
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                  <span className="text-white font-medium">
                    {pendingJob.status === 'running' ? 'Génération...' : 'En file d\'attente...'}
                  </span>
                  {pendingJob.progress > 0 && (
                    <span className="text-white/70 text-sm">{Math.round(pendingJob.progress)}%</span>
                  )}
                  {/* Progress bar */}
                  <div className="w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-300"
                      style={{ width: `${pendingJob.progress || 5}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : referenceImage ? (
              <StorageImg
                src={referenceImage}
                alt={name || 'Lieu'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                <ImageIcon className="w-16 h-16 text-slate-700" />
              </div>
            )}

            {/* Overlay with buttons */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Rushes overlay */}
            {showRushes && rushes.length > 0 && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6">
                <div className="w-full">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Images className="w-5 h-5 text-yellow-400" />
                      <span className="text-base text-white font-medium">Rushes ({rushes.length})</span>
                    </div>
                    <button
                      onClick={() => setShowRushes(false)}
                      className="p-1.5 hover:bg-white/10 rounded transition-colors"
                    >
                      <X className="w-5 h-5 text-white/70" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {rushes.map((rush, index) => (
                      <div
                        key={rush.url}
                        className="relative group aspect-video rounded-xl overflow-hidden border-2 border-white/20 hover:border-yellow-500 transition-all cursor-pointer shadow-lg"
                      >
                        <StorageImg
                          src={rush.url}
                          alt={`Rush ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* Overlay with actions */}
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button
                            onClick={() => {
                              promoteRush(rush);
                              setShowRushes(false);
                            }}
                            className="p-2.5 bg-green-500/90 rounded-full hover:bg-green-500 hover:scale-110 transition-all"
                            title="Utiliser cette image"
                          >
                            <Check className="w-5 h-5 text-white" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteRush(rush);
                            }}
                            className="p-2.5 bg-red-500/90 rounded-full hover:bg-red-500 hover:scale-110 transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5 text-white" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Upload / Generate / Clear buttons */}
            <div className="absolute bottom-3 left-3 right-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1 bg-black/50 border-white/20 text-white hover:bg-black/70"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Uploader
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateImage}
                disabled={isGenerating || !visualDescription.trim() || !name.trim()}
                className="flex-1 bg-black/50 border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
                title={inspirationImages.length > 0 ? `Génération image-to-image avec ${I2I_MODEL_OPTIONS.find(m => m.value === selectedI2IModel)?.label}` : undefined}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Générer IA
              </Button>
              {rushes.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRushes(!showRushes)}
                  className={cn(
                    "bg-black/50 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20",
                    showRushes && "bg-yellow-500/20"
                  )}
                >
                  <Images className="w-4 h-4 mr-1" />
                  {rushes.length}
                </Button>
              )}
              {referenceImage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Use server-side proxy to avoid CORS
                      const filename = `${name || 'lieu'}.png`;
                      const downloadUrl = `/api/storage/download?url=${encodeURIComponent(referenceImage)}&filename=${encodeURIComponent(filename)}`;
                      window.open(downloadUrl, '_blank');
                    }}
                    className="bg-black/50 border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReferenceImage(null)}
                    className="bg-black/50 border-red-500/30 text-red-300 hover:bg-red-500/20"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadImage}
            className="hidden"
          />
        </div>

        {/* Form content */}
        <div className="p-6 pt-3 space-y-3">
          {/* Title row + Aspect ratio */}
          <DialogHeader className="p-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-green-500/20">
                  <MapPin className="w-4 h-4 text-green-400" />
                </div>
                <DialogTitle className="text-sm font-semibold text-white">
                  {isEditing ? 'Modifier le lieu' : 'Nouveau lieu'}
                </DialogTitle>
              </div>
              {/* Aspect ratio toggle with visual icons */}
              <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10 gap-0.5">
                {ASPECT_RATIO_OPTIONS.map((ratio) => {
                  // Visual representation of aspect ratios
                  const getAspectIcon = (value: string) => {
                    switch (value) {
                      case '16:9':
                        return <div className="w-5 h-3 border-2 border-current rounded-[2px]" />;
                      case '9:16':
                        return <div className="w-2.5 h-4 border-2 border-current rounded-[2px]" />;
                      case '1:1':
                        return <div className="w-3.5 h-3.5 border-2 border-current rounded-[2px]" />;
                      case '3:4':
                        return <div className="w-3 h-4 border-2 border-current rounded-[2px]" />;
                      default:
                        return null;
                    }
                  };
                  return (
                    <button
                      key={ratio.value}
                      onClick={() => setSelectedAspectRatio(ratio.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded transition-all',
                        selectedAspectRatio === ratio.value
                          ? 'bg-green-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      {getAspectIcon(ratio.value)}
                      {ratio.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </DialogHeader>

          {/* Name + Type row */}
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-slate-400 text-xs">Nom</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Café de la Gare"
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div className="w-32 space-y-1.5">
              <Label className="text-slate-400 text-xs">Type</Label>
              <Select value={intExt} onValueChange={(v) => setIntExt(v as typeof intExt)}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a2433] border-white/10">
                  {INT_EXT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-white">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Visual Description */}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs">Description visuelle (pour génération IA)</Label>
            <Textarea
              value={visualDescription}
              onChange={(e) => setVisualDescription(e.target.value)}
              placeholder="Ex: Un petit café parisien typique avec des tables en terrasse, chaises en rotin, store rouge et blanc, lumière chaude du soir..."
              className="bg-white/5 border-white/10 text-white min-h-[100px] resize-none"
            />
          </div>

          {/* Inspiration Images */}
          <div className="space-y-1.5">
            <Label className="text-slate-400 text-xs flex items-center gap-2">
              Images d&apos;inspiration
              <span className="text-slate-500 font-normal">(optionnel, max 4)</span>
            </Label>
            <div className="flex gap-2 items-start">
              {/* Thumbnails */}
              {inspirationImages.map((url, index) => (
                <div key={url} className="relative group">
                  <StorageImg
                    src={url}
                    alt={`Inspiration ${index + 1}`}
                    className="w-16 h-16 object-cover rounded-lg border border-white/10"
                  />
                  <button
                    onClick={() => removeInspirationImage(index)}
                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}

              {/* Drop zone / Add button */}
              {inspirationImages.length < 4 && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => inspirationInputRef.current?.click()}
                  className={cn(
                    'w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all',
                    isDraggingInspiration
                      ? 'border-purple-500 bg-purple-500/20'
                      : 'border-white/20 hover:border-white/40 hover:bg-white/5'
                  )}
                >
                  {isUploadingInspiration ? (
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  ) : (
                    <ImagePlus className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              )}

              {/* Helper text when no images */}
              {inspirationImages.length === 0 && !isDraggingInspiration && (
                <p className="text-xs text-slate-500 self-center ml-2">
                  Glissez-déposez ou cliquez pour ajouter des références visuelles pour Claude
                </p>
              )}
            </div>
            <input
              ref={inspirationInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => e.target.files && handleInspirationUpload(e.target.files)}
              className="hidden"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            {/* Model + Resolution toggles */}
            <div className="flex items-center gap-2">
              {/* Model toggle - switches between text-to-image and image-to-image models */}
              {inspirationImages.length > 0 ? (
                <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-orange-500/30">
                  {I2I_MODEL_OPTIONS.map((model) => (
                    <button
                      key={model.value}
                      onClick={() => setSelectedI2IModel(model.value)}
                      className={cn(
                        'px-2 py-1.5 text-[11px] font-medium rounded transition-all whitespace-nowrap',
                        selectedI2IModel === model.value
                          ? 'bg-orange-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10">
                  {MODEL_OPTIONS.map((model) => (
                    <button
                      key={model.value}
                      onClick={() => setSelectedModel(model.value)}
                      className={cn(
                        'px-2 py-1.5 text-[11px] font-medium rounded transition-all whitespace-nowrap',
                        selectedModel === model.value
                          ? 'bg-purple-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      {model.label}
                    </button>
                  ))}
                </div>
              )}
              {/* Resolution toggle */}
              <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10">
                {RESOLUTION_OPTIONS.map((res) => (
                  <button
                    key={res.value}
                    onClick={() => setSelectedResolution(res.value)}
                    className={cn(
                      'px-2 py-1.5 text-[11px] font-medium rounded transition-all',
                      selectedResolution === res.value
                        ? 'bg-blue-500 text-white'
                        : 'text-slate-400 hover:text-white'
                    )}
                  >
                    {res.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="border-white/10 text-slate-300 hover:bg-white/5"
              >
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !name.trim()}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                {isEditing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* CSS for rainbow animation */}
      <style jsx global>{`
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
        }

        @keyframes rainbow-spin {
          from {
            transform: rotate(0deg) scale(2);
          }
          to {
            transform: rotate(360deg) scale(2);
          }
        }
      `}</style>
    </Dialog>
  );
}
