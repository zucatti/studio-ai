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
import { StorageImg } from '@/components/ui/storage-image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GlobalAsset } from '@/types/database';
import { MapPin, Upload, Loader2, Save, Wand2, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
}

const INT_EXT_OPTIONS = [
  { value: 'INT', label: 'Intérieur' },
  { value: 'EXT', label: 'Extérieur' },
  { value: 'INT/EXT', label: 'Int/Ext' },
];

const MODEL_OPTIONS = [
  { value: 'fal-ai/nano-banana-2', label: 'Nano Banana 2', description: 'Rapide, haute qualité' },
  { value: 'fal-ai/flux-pro/v1.1', label: 'Flux Pro', description: 'Très haute qualité' },
] as const;

type ModelType = typeof MODEL_OPTIONS[number]['value'];

export function LocationFormDialog({
  open,
  onOpenChange,
  location,
  onSuccess,
}: LocationFormDialogProps) {
  const isEditing = !!location;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [name, setName] = useState('');
  const [visualDescription, setVisualDescription] = useState('');
  const [intExt, setIntExt] = useState<'INT' | 'EXT' | 'INT/EXT'>('INT');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelType>('fal-ai/nano-banana-2');

  // Loading states
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Initialize form when location changes
  useEffect(() => {
    if (location) {
      const data = location.data as LocationData | undefined;
      setName(location.name);
      setVisualDescription(data?.visual_description || '');
      setIntExt(data?.int_ext || 'INT');
      setReferenceImage(location.reference_images?.[0] || null);
    } else {
      setName('');
      setVisualDescription('');
      setIntExt('INT');
      setReferenceImage(null);
    }
  }, [location, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Le nom est requis');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: name.trim(),
        asset_type: 'location',
        data: {
          visual_description: visualDescription,
          int_ext: intExt,
        },
        reference_images: referenceImage ? [referenceImage] : [],
      };

      const url = isEditing ? `/api/global-assets/${location.id}` : '/api/global-assets';
      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(isEditing ? 'Lieu mis à jour' : 'Lieu créé');
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

    // If not editing, save first
    if (!isEditing) {
      toast.error('Sauvegardez le lieu avant de générer');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch(`/api/global-assets/${location.id}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate_single',
          style: 'photorealistic',
          viewType: 'front',
          model: selectedModel,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.imageUrls?.length > 0) {
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
      <DialogContent className="max-w-2xl p-0 bg-[#0d1520] border-white/10 overflow-hidden">
        {/* Header with image */}
        <div className="relative">
          {/* Image area */}
          <div className="relative aspect-video bg-slate-900">
            {referenceImage ? (
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

            {/* Upload / Generate buttons */}
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
                disabled={isGenerating || !isEditing || !visualDescription.trim()}
                className="flex-1 bg-black/50 border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                Générer IA
              </Button>
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
        <div className="p-6 space-y-4">
          {/* Title row */}
          <DialogHeader className="p-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <MapPin className="w-5 h-5 text-green-400" />
              </div>
              <DialogTitle className="text-lg font-semibold text-white">
                {isEditing ? 'Modifier le lieu' : 'Nouveau lieu'}
              </DialogTitle>
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
              className="bg-white/5 border-white/10 text-white min-h-[120px] resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            {/* Model toggle - left side */}
            <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10">
              {MODEL_OPTIONS.map((model) => (
                <button
                  key={model.value}
                  onClick={() => setSelectedModel(model.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded transition-all',
                    selectedModel === model.value
                      ? 'bg-purple-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  {model.label}
                </button>
              ))}
            </div>

            {/* Action buttons - right side */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-white/10 text-slate-300 hover:bg-white/5"
              >
                Annuler
              </Button>
              <Button
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
    </Dialog>
  );
}
