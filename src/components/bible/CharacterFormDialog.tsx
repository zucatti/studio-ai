'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StorageImg, StorageBackgroundDiv } from '@/components/ui/storage-image';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useBibleStore,
  type CharacterData,
  type ReferenceImage,
  type CharacterImageType,
  type LookVariation,
} from '@/store/bible-store';
import type { GlobalAsset } from '@/types/database';
import {
  User,
  Upload,
  Wand2,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  ImagePlus,
  Check,
  Save,
  X,
  Camera,
  Shirt,
  Mic,
  Play,
  Search,
  Volume2,
  Pause,
  Images,
  Download,
  Clock,
} from 'lucide-react';
import { GalleryPicker } from '@/components/gallery/GalleryPicker';
import { generateReferenceName, generateLookReferenceName } from '@/lib/reference-name';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CharacterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character?: GlobalAsset | null;
  onSuccess?: (character: GlobalAsset) => void;
}

interface ElevenLabsVoice {
  id: string;
  name: string;
  labels: Record<string, string>;
  previewUrl?: string;
  category: string;
}

type TabType = 'references' | 'looks' | 'audio';

const IMAGE_TYPES: { value: CharacterImageType; label: string; description: string }[] = [
  { value: 'front', label: 'Face', description: 'Vue de face' },
  { value: 'profile', label: 'Profil', description: 'Vue de côté' },
  { value: 'back', label: 'Dos', description: 'Vue arrière' },
  { value: 'three_quarter', label: '3/4', description: 'Vue trois-quarts' },
  { value: 'custom', label: 'Autre', description: 'Image personnalisée' },
];

const STYLE_OPTIONS = [
  { value: 'photorealistic', label: 'Photoréaliste' },
  { value: 'cartoon', label: 'Cartoon/Pixar' },
  { value: 'anime', label: 'Anime' },
  { value: 'cyberpunk', label: 'Cyberpunk' },
  { value: 'noir', label: 'Film Noir' },
  { value: 'watercolor', label: 'Aquarelle' },
];

const MODEL_OPTIONS = [
  { value: 'fal-ai/nano-banana-2', label: 'Nano Banana 2' },
  { value: 'seedream-5', label: 'Seedream 5' },
  { value: 'flux-2-pro', label: 'Flux 2 Pro' },
  { value: 'gpt-image-1.5', label: 'GPT Image 1.5' },
] as const;

const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const;

type ModelType = typeof MODEL_OPTIONS[number]['value'];

const TABS: { value: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'references', label: 'Références', icon: Camera },
  { value: 'looks', label: 'Looks', icon: Shirt },
  { value: 'audio', label: 'Audio', icon: Mic },
];

export function CharacterFormDialog({
  open,
  onOpenChange,
  character,
  onSuccess,
}: CharacterFormDialogProps) {
  const isEditing = !!character;

  const {
    createCharacter,
    updateCharacter,
    generateCharacterImages,
    queueCharacterImageGeneration,
    uploadCharacterImage,
    isGenerating,
  } = useBibleStore();

  // Form state
  const [name, setName] = useState(character?.name || '');
  const [description, setDescription] = useState(
    (character?.data as CharacterData)?.description || ''
  );
  const [visualDescription, setVisualDescription] = useState(
    (character?.data as CharacterData)?.visual_description || ''
  );
  const [age, setAge] = useState((character?.data as CharacterData)?.age || '');
  const [gender, setGender] = useState((character?.data as CharacterData)?.gender || '');
  const [tags, setTags] = useState((character?.tags || []).join(', '));
  const [style, setStyle] = useState('photorealistic');
  const [selectedModel, setSelectedModel] = useState<ModelType>('fal-ai/nano-banana-2');
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');
  const [useQueue, setUseQueue] = useState(true); // Queue mode enabled

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('references');

  // Image state
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(
    (character?.data as CharacterData)?.reference_images_metadata || []
  );
  const [pendingFiles, setPendingFiles] = useState<Map<CharacterImageType, File>>(new Map());
  const [uploadingType, setUploadingType] = useState<CharacterImageType | null>(null);
  const [uploadingImageType, setUploadingImageType] = useState<CharacterImageType | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatingView, setGeneratingView] = useState<CharacterImageType | null>(null);
  const [savedCharacterId, setSavedCharacterId] = useState<string | null>(null);

  // Looks state
  const [looks, setLooks] = useState<LookVariation[]>(
    (character?.data as CharacterData)?.looks || []
  );
  const [newLookName, setNewLookName] = useState('');
  const [newLookDescription, setNewLookDescription] = useState('');
  const [uploadingLook, setUploadingLook] = useState(false);
  const [generatingLook, setGeneratingLook] = useState(false);
  const [showGalleryPicker, setShowGalleryPicker] = useState(false);

  // Audio state
  const [voiceId, setVoiceId] = useState((character?.data as CharacterData)?.voice_id || '');
  const [voiceName, setVoiceName] = useState((character?.data as CharacterData)?.voice_name || '');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lookFileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens/closes or character changes
  const resetForm = useCallback(() => {
    if (character) {
      const data = character.data as CharacterData;
      setName(character.name);
      setDescription(data?.description || '');
      setVisualDescription(data?.visual_description || '');
      setAge(data?.age || '');
      setGender(data?.gender || '');
      setTags((character.tags || []).join(', '));
      setReferenceImages(data?.reference_images_metadata || []);
      setLooks(data?.looks || []);
      setVoiceId(data?.voice_id || '');
      setVoiceName(data?.voice_name || '');
    } else {
      setName('');
      setDescription('');
      setVisualDescription('');
      setAge('');
      setGender('');
      setTags('');
      setReferenceImages([]);
      setLooks([]);
      setVoiceId('');
      setVoiceName('');
    }
    setStyle('photorealistic');
    setActiveTab('references');
    setSavedCharacterId(null);
    setPendingFiles(new Map());
  }, [character]);

  // Reset form when dialog opens or character changes
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, character, resetForm]);

  // Fetch voices when audio tab is active
  useEffect(() => {
    if (activeTab === 'audio' && voices.length === 0) {
      fetchVoices();
    }
  }, [activeTab]);

  const fetchVoices = async (search?: string) => {
    setLoadingVoices(true);
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const res = await fetch(`/api/elevenlabs/voices${params}`);
      if (res.ok) {
        const data = await res.json();
        setVoices(data.voices || []);
      }
    } catch (error) {
      console.error('Error fetching voices:', error);
    } finally {
      setLoadingVoices(false);
    }
  };

  // Handle file upload for reference images
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadingType) return;

    const currentCharacterId = character?.id || savedCharacterId;
    const currentUploadingType = uploadingType;

    setUploadingImageType(currentUploadingType);

    try {
      if (!currentCharacterId) {
        // During creation: store blob URL for preview and keep the file for later upload
        const url = URL.createObjectURL(file);
        const newImage: ReferenceImage = {
          url,
          type: currentUploadingType,
          label: IMAGE_TYPES.find((t) => t.value === currentUploadingType)?.description || '',
        };

        setReferenceImages((prev) => {
          const filtered = prev.filter((img) => img.type !== currentUploadingType);
          return [...filtered, newImage];
        });

        // Store the file for later upload when we save
        setPendingFiles((prev) => {
          const newMap = new Map(prev);
          newMap.set(currentUploadingType, file);
          return newMap;
        });
      } else {
        const url = await uploadCharacterImage(currentCharacterId, file, currentUploadingType);
        if (url) {
          setReferenceImages((prev) => {
            const filtered = prev.filter((img) => img.type !== currentUploadingType);
            return [
              ...filtered,
              {
                url,
                type: currentUploadingType,
                label: IMAGE_TYPES.find((t) => t.value === currentUploadingType)?.description || '',
              },
            ];
          });
        }
      }
    } finally {
      setUploadingImageType(null);
      setUploadingType(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle click on empty image slot - auto-generate if possible
  const handleImageSlotClick = async (imageType: CharacterImageType) => {
    const existingImage = referenceImages.find((img) => img.type === imageType);

    if (existingImage) {
      // Already has image - just trigger upload for replacement
      setUploadingType(imageType);
      fileInputRef.current?.click();
      return;
    }

    const hasFrontImage = referenceImages.some((img) => img.type === 'front');
    // Can auto-generate if we have a front image (will auto-save if needed)
    const canAutoGenerate = hasFrontImage && imageType !== 'front';

    if (canAutoGenerate) {
      // Auto-generate this view
      await handleGenerateSingle(imageType);
    } else {
      // No face image or clicking on front slot - open file picker
      setUploadingType(imageType);
      fileInputRef.current?.click();
    }
  };

  // Trigger file upload for specific type (force upload, no auto-generate)
  const triggerUpload = (imageType: CharacterImageType) => {
    setUploadingType(imageType);
    fileInputRef.current?.click();
  };

  // Remove an image
  const removeImage = (imageType: CharacterImageType) => {
    setReferenceImages((prev) => prev.filter((img) => img.type !== imageType));
  };

  // Generate single view
  const handleGenerateSingle = async (viewType: CharacterImageType) => {
    let characterId = character?.id || savedCharacterId;

    // If no character exists, create one first
    if (!characterId) {
      if (!name.trim()) {
        toast.error('Le nom du personnage est requis');
        return;
      }

      setGeneratingView(viewType);

      try {
        // Create the character first
        const characterData: CharacterData = {
          description,
          visual_description: visualDescription,
          age: age || undefined,
          gender: gender || undefined,
          reference_images_metadata: [],
        };

        const tagArray = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        const newCharacter = await createCharacter({
          name,
          data: characterData,
          tags: tagArray,
          reference_images: [],
        });

        if (!newCharacter) {
          toast.error('Erreur lors de la création du personnage');
          setGeneratingView(null);
          return;
        }

        characterId = newCharacter.id;
        setSavedCharacterId(characterId);

        // Upload any pending files
        const uploadedImages: ReferenceImage[] = [];
        for (const [imageType, file] of pendingFiles) {
          const url = await uploadCharacterImage(characterId, file, imageType);
          if (url) {
            uploadedImages.push({
              url,
              type: imageType,
              label: IMAGE_TYPES.find((t) => t.value === imageType)?.description || '',
            });
          }
        }

        // Clear pending files and update reference images with real URLs
        setPendingFiles(new Map());
        if (uploadedImages.length > 0) {
          setReferenceImages(uploadedImages);
        }
      } catch (error) {
        console.error('Error creating character:', error);
        setGeneratingView(null);
        return;
      }
    }

    // Now generate the image (either queue or synchronous)
    if (useQueue) {
      // Queue mode - submit job and return immediately
      const jobId = await queueCharacterImageGeneration({
        assetId: characterId,
        assetName: name,
        viewType,
        style,
        model: selectedModel,
        resolution,
        visualDescription,
      });

      setGeneratingView(null);

      if (jobId) {
        toast.success(`Génération de "${viewType}" ajoutée à la file d'attente`, {
          description: 'Vous pouvez continuer à travailler pendant la génération.',
        });
      } else {
        toast.error('Erreur lors de la mise en file d\'attente');
      }
    } else {
      // Synchronous mode - wait for result
      setGeneratingView(viewType);
      try {
        // Upload any pending files first (images with blob URLs)
        if (pendingFiles.size > 0) {
          const uploadedImages: ReferenceImage[] = [];
          for (const [imageType, file] of pendingFiles) {
            const url = await uploadCharacterImage(characterId, file, imageType);
            if (url) {
              uploadedImages.push({
                url,
                type: imageType,
                label: IMAGE_TYPES.find((t) => t.value === imageType)?.description || '',
              });
            }
          }

          // Clear pending files and update reference images with real URLs
          setPendingFiles(new Map());
          if (uploadedImages.length > 0) {
            setReferenceImages(prev => {
              const merged = [...prev];
              for (const newImg of uploadedImages) {
                const idx = merged.findIndex(img => img.type === newImg.type);
                if (idx >= 0) {
                  merged[idx] = newImg;
                } else {
                  merged.push(newImg);
                }
              }
              return merged;
            });
          }
        }

        const result = await generateCharacterImages(characterId, {
          mode: 'generate_single',
          viewType,
          style,
          model: selectedModel,
          resolution,
          visualDescription,
        });

        if (result) {
          // Merge with local state to preserve any images not yet synced
          setReferenceImages(prev => {
            const merged = [...prev];
            for (const newImg of result) {
              const idx = merged.findIndex(img => img.type === newImg.type);
              if (idx >= 0) {
                merged[idx] = newImg;
              } else {
                merged.push(newImg);
              }
            }
            return merged;
          });
          toast.success('Image générée avec succès');
        }
      } finally {
        setGeneratingView(null);
      }
    }
  };

  // Handle look file upload
  const handleLookFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !newLookName.trim()) return;

    setUploadingLook(true);
    try {
      // Upload the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'project-assets');

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        const newLook: LookVariation = {
          id: crypto.randomUUID(),
          name: newLookName.trim(),
          description: newLookDescription.trim(),
          imageUrl: url,
        };
        setLooks((prev) => [...prev, newLook]);
        setNewLookName('');
        setNewLookDescription('');
      }
    } catch (error) {
      console.error('Error uploading look:', error);
    } finally {
      setUploadingLook(false);
      if (lookFileInputRef.current) {
        lookFileInputRef.current.value = '';
      }
    }
  };

  // Remove a look
  const removeLook = (lookId: string) => {
    setLooks((prev) => prev.filter((l) => l.id !== lookId));
  };

  // Handle gallery image selection for look (two-step flow: image first, then name/description)
  const handleGallerySelect = (imageUrl: string, _image: unknown, lookName?: string, lookDescription?: string) => {
    if (!lookName?.trim()) return;

    const newLook: LookVariation = {
      id: crypto.randomUUID(),
      name: lookName.trim(),
      description: lookDescription?.trim() || '',
      imageUrl: imageUrl,
    };
    setLooks((prev) => [...prev, newLook]);
    setShowGalleryPicker(false);
  };

  // Generate look with AI
  const handleGenerateLook = async () => {
    if (!character || !newLookDescription.trim()) return;

    setGeneratingLook(true);
    try {
      const res = await fetch(`/api/global-assets/${character.id}/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate_look',
          lookName: newLookName.trim() || 'Look généré',
          lookDescription: newLookDescription.trim(),
          style,
          model: selectedModel,
          resolution,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.look) {
          setLooks((prev) => [...prev, data.look]);
          setNewLookName('');
          setNewLookDescription('');
        }
      } else {
        const error = await res.json();
        console.error('Error generating look:', error);
      }
    } catch (error) {
      console.error('Error generating look:', error);
    } finally {
      setGeneratingLook(false);
    }
  };

  // Play voice preview
  const playVoicePreview = async (voice: ElevenLabsVoice) => {
    if (playingPreview === voice.id) {
      // Stop current playback
      audioRef.current?.pause();
      setPlayingPreview(null);
      return;
    }

    // Use the preview URL if available
    if (voice.previewUrl) {
      if (audioRef.current) {
        audioRef.current.src = voice.previewUrl;
        audioRef.current.play();
        setPlayingPreview(voice.id);
        audioRef.current.onended = () => setPlayingPreview(null);
      }
    } else {
      // Generate a preview
      setGeneratingPreview(true);
      try {
        const res = await fetch('/api/elevenlabs/voices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voiceId: voice.id,
            text: name ? `Bonjour, je suis ${name}.` : 'Bonjour, comment allez-vous ?',
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (audioRef.current) {
            audioRef.current.src = data.audio;
            audioRef.current.play();
            setPlayingPreview(voice.id);
            audioRef.current.onended = () => setPlayingPreview(null);
          }
        }
      } catch (error) {
        console.error('Error generating preview:', error);
      } finally {
        setGeneratingPreview(false);
      }
    }
  };

  // Select a voice
  const selectVoice = (voice: ElevenLabsVoice) => {
    setVoiceId(voice.id);
    setVoiceName(voice.name);
  };

  // Submit form
  const handleSubmit = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);

    const characterData: CharacterData = {
      description,
      visual_description: visualDescription,
      age: age || undefined,
      gender: gender || undefined,
      reference_images_metadata: referenceImages,
      looks: looks.length > 0 ? looks : undefined,
      voice_id: voiceId || undefined,
      voice_name: voiceName || undefined,
    };

    const tagArray = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      let result: GlobalAsset | null = null;
      const existingCharacterId = character?.id || savedCharacterId;

      if (existingCharacterId) {
        // Update existing character (either editing or auto-saved during creation)
        result = await updateCharacter(existingCharacterId, {
          name,
          data: characterData,
          tags: tagArray,
          reference_images: referenceImages.map((img) => img.url),
        });
      } else {
        // Create new character
        result = await createCharacter({
          name,
          data: characterData,
          tags: tagArray,
          reference_images: referenceImages.map((img) => img.url),
        });
      }

      if (result) {
        onSuccess?.(result);
        onOpenChange(false);
        resetForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if we have enough info to generate
  const hasFrontImage = referenceImages.some((img) => img.type === 'front');
  // Allow generation if we have a front image (even during creation - will auto-save first)
  const canGenerate = hasFrontImage;

  // Filter voices based on search
  const filteredVoices = voiceSearch
    ? voices.filter(
        (v) =>
          v.name.toLowerCase().includes(voiceSearch.toLowerCase()) ||
          Object.values(v.labels).some((l) => l.toLowerCase().includes(voiceSearch.toLowerCase()))
      )
    : voices;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden [&>button]:hidden">
        {/* Header */}
        <DialogHeader className="px-8 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20">
                  <User className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold text-white">
                    {isEditing ? 'Modifier le personnage' : 'Créer un personnage'}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-400 mt-0.5">
                    {isEditing
                      ? 'Informations et images de référence'
                      : `Référence: @${name.replace(/\s+/g, '') || 'nom'}`}
                  </DialogDescription>
                </div>
              </div>

              {/* Tab buttons in header */}
              <div className="flex items-center gap-1 ml-4 pl-4 border-l border-white/10">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => setActiveTab(tab.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                        activeTab === tab.value
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                      {tab.value === 'looks' && looks.length > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.5 text-xs bg-white/10 rounded">
                          {looks.length}
                        </span>
                      )}
                      {tab.value === 'audio' && voiceId && (
                        <Check className="w-3 h-3 text-green-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action buttons in header */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-4 h-4 mr-1.5" />
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!name.trim() || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : isEditing ? (
                  <Save className="w-4 h-4 mr-1.5" />
                ) : (
                  <Plus className="w-4 h-4 mr-1.5" />
                )}
                {isEditing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Main content - Two columns */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left column - Information */}
          <div className="w-[40%] border-r border-white/10 overflow-y-auto scrollbar-none">
            <div className="p-8 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  Informations générales
                </h3>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name" className="text-slate-300">
                      Nom du personnage <span className="text-red-400">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Marie Dubois"
                      className="bg-white/5 border-white/10 text-white h-11"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="age" className="text-slate-300">
                        Âge
                      </Label>
                      <Input
                        id="age"
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="Ex: 35 ans"
                        className="bg-white/5 border-white/10 text-white h-11"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="gender" className="text-slate-300">
                        Genre
                      </Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white h-11">
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a2433] border-white/10">
                          <SelectItem value="homme">Homme</SelectItem>
                          <SelectItem value="femme">Femme</SelectItem>
                          <SelectItem value="non-binaire">Non-binaire</SelectItem>
                          <SelectItem value="autre">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="tags" className="text-slate-300">
                      Tags <span className="text-slate-500 font-normal">(séparés par des virgules)</span>
                    </Label>
                    <Input
                      id="tags"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="Ex: protagoniste, détective, mystérieux"
                      className="bg-white/5 border-white/10 text-white h-11"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                  Description
                </h3>

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="description" className="text-slate-300">
                      Personnalité & Histoire
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Décrivez le personnage, son histoire, sa personnalité, ses motivations..."
                      className="bg-white/5 border-white/10 text-white min-h-[120px] resize-none"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="visual_description" className="text-slate-300">
                      Description visuelle <span className="text-red-400">*</span>
                    </Label>
                    <Textarea
                      id="visual_description"
                      value={visualDescription}
                      onChange={(e) => setVisualDescription(e.target.value)}
                      placeholder="Décrivez l'apparence physique: cheveux, yeux, morphologie, vêtements typiques, style vestimentaire..."
                      className="bg-white/5 border-white/10 text-white min-h-[140px] resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">
                        Cette description sera utilisée pour générer les images de référence avec l'IA.
                      </p>
                      <Button
                        type="button"
                        onClick={() => handleGenerateSingle('front')}
                        disabled={!visualDescription.trim() || !name.trim() || generatingView === 'front' || isGenerating}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg shadow-purple-500/25"
                      >
                        {generatingView === 'front' ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Génération...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            Générer le visage IA
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Tab content */}
          <div className="w-[60%] flex flex-col overflow-hidden bg-[#0a0f16]">
            {/* Model + Resolution + Style selectors - only visible on references tab */}
            {activeTab === 'references' && (
              <div className="flex items-center justify-end gap-3 px-8 py-3 border-b border-white/10">
                {/* Model toggle */}
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
                {/* Resolution toggle */}
                <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10">
                  {RESOLUTION_OPTIONS.map((res) => (
                    <button
                      key={res.value}
                      onClick={() => setResolution(res.value)}
                      className={cn(
                        'px-2.5 py-1.5 text-xs font-medium rounded transition-all',
                        resolution === res.value
                          ? 'bg-blue-500 text-white'
                          : 'text-slate-400 hover:text-white'
                      )}
                    >
                      {res.label}
                    </button>
                  ))}
                </div>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger className="w-40 h-8 bg-white/5 border-white/10 text-white text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2433] border-white/10">
                    {STYLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Queue toggle */}
                <button
                  onClick={() => setUseQueue(!useQueue)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-md border transition-all flex items-center gap-1.5',
                    useQueue
                      ? 'bg-green-500/20 border-green-500/30 text-green-400'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  )}
                  title={useQueue ? 'Mode file d\'attente activé' : 'Mode synchrone'}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {useQueue ? 'File' : 'Sync'}
                </button>
              </div>
            )}

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto scrollbar-none p-8">
              {/* References Tab */}
              {activeTab === 'references' && (
                <div className="space-y-6">
                  {/* Masonry grid - Pinterest style */}
                  <div className="columns-3 gap-4 space-y-4">
                    {IMAGE_TYPES.map((imageType) => {
                      const existingImage = referenceImages.find((img) => img.type === imageType.value);
                      const isGeneratingThis = generatingView === imageType.value;
                      const isUploadingThis = uploadingImageType === imageType.value;

                      return (
                        <div
                          key={imageType.value}
                          className={cn(
                            'relative rounded-xl group transition-all cursor-pointer break-inside-avoid mb-4 overflow-hidden',
                            existingImage
                              ? 'ring-1 ring-white/20'
                              : 'border-2 border-dashed border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          )}
                          onClick={() => !isGeneratingThis && !isUploadingThis && handleImageSlotClick(imageType.value)}
                        >
                          {isGeneratingThis || isUploadingThis ? (
                            <div className="aspect-[3/4] flex flex-col items-center justify-center gap-3">
                              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                              <span className="text-sm text-slate-400">
                                {isUploadingThis ? 'Upload...' : 'Génération...'}
                              </span>
                            </div>
                          ) : existingImage ? (
                            <div className="relative">
                              <StorageImg
                                src={existingImage.url}
                                alt={imageType.label}
                                className="w-full h-auto rounded-xl"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 rounded-xl">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-white hover:bg-white/20 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const filename = `${name.replace(/\s+/g, '-').toLowerCase()}-${imageType.value}.webp`;
                                      const downloadUrl = `/api/download?url=${encodeURIComponent(existingImage.url)}&filename=${encodeURIComponent(filename)}`;
                                      const iframe = document.createElement('iframe');
                                      iframe.style.display = 'none';
                                      iframe.src = downloadUrl;
                                      document.body.appendChild(iframe);
                                      setTimeout(() => document.body.removeChild(iframe), 5000);
                                    }}
                                    title="Télécharger"
                                  >
                                    <Download className="w-5 h-5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-white hover:bg-white/20 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerUpload(imageType.value);
                                    }}
                                    title="Remplacer"
                                  >
                                    <RefreshCw className="w-5 h-5" />
                                  </Button>
                                  {canGenerate && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-10 w-10 text-white hover:bg-white/20 rounded-lg"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleGenerateSingle(imageType.value);
                                      }}
                                      disabled={isGenerating}
                                      title="Régénérer avec IA"
                                    >
                                      <Wand2 className="w-5 h-5" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-red-400 hover:bg-red-500/20 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeImage(imageType.value);
                                    }}
                                    title="Supprimer"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </Button>
                                </div>
                              </div>
                              <div className="absolute bottom-2 left-2">
                                <span className="text-sm text-white font-medium px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm">
                                  {imageType.label}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-[3/4] flex flex-col items-center justify-center gap-4 p-4">
                              <span className="text-sm font-medium text-white">{imageType.label}</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-white/20 text-slate-300 hover:bg-white/10 hover:text-white"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerUpload(imageType.value);
                                  }}
                                >
                                  <Upload className="w-4 h-4 mr-1.5" />
                                  Upload
                                </Button>
                                {canGenerate && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleGenerateSingle(imageType.value);
                                    }}
                                    disabled={isGenerating}
                                  >
                                    <Wand2 className="w-4 h-4 mr-1.5" />
                                    IA
                                  </Button>
                                )}
                              </div>
                              <span className="text-xs text-slate-500">{imageType.description}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Help text for new characters */}
                  {!isEditing && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                      <p className="text-sm text-blue-300">
                        Vous pouvez uploader des images maintenant ou générer des images après avoir créé le personnage.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Looks Tab */}
              {activeTab === 'looks' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Variations de look</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Ajoutez différentes tenues, situations ou styles pour ce personnage
                      </p>
                    </div>
                  </div>

                  {/* Add new look form */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <div className="space-y-4">
                      <div>
                        <Label className="text-slate-300 text-sm">Nom du look</Label>
                        <Input
                          value={newLookName}
                          onChange={(e) => setNewLookName(e.target.value)}
                          placeholder="Ex: Tenue de soirée"
                          className="mt-1 bg-white/5 border-white/10 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-slate-300 text-sm">
                          Description du look <span className="text-slate-500 font-normal">(tenue, accessoires, contexte...)</span>
                        </Label>
                        <Textarea
                          value={newLookDescription}
                          onChange={(e) => setNewLookDescription(e.target.value)}
                          placeholder="Ex: Robe noire élégante, talons hauts, collier de perles, maquillage sophistiqué, tenue de gala..."
                          className="mt-1 bg-white/5 border-white/10 text-white min-h-[80px] resize-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          L'IA utilisera automatiquement les caractéristiques physiques du personnage (âge, morphologie...).
                        </p>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          onClick={() => setShowGalleryPicker(true)}
                          disabled={uploadingLook || generatingLook}
                          variant="outline"
                          className="flex-1 min-w-[140px] border-purple-500/30 text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/50"
                        >
                          <Images className="w-4 h-4 mr-2" />
                          Depuis les Rushes
                        </Button>
                        <Button
                          onClick={() => lookFileInputRef.current?.click()}
                          disabled={!newLookName.trim() || uploadingLook || generatingLook}
                          variant="outline"
                          className="flex-1 min-w-[140px] border-white/20 text-slate-300 hover:bg-white/10 hover:border-white/30"
                        >
                          {uploadingLook ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Uploader
                        </Button>
                        {isEditing && (
                          <Button
                            onClick={handleGenerateLook}
                            disabled={!newLookDescription.trim() || uploadingLook || generatingLook}
                            className="flex-1 min-w-[140px] bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            {generatingLook ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4 mr-2" />
                            )}
                            Générer
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Looks grid */}
                  {looks.length > 0 ? (
                    <div className="grid grid-cols-3 gap-4">
                      {looks.map((look) => (
                        <div
                          key={look.id}
                          className="relative aspect-[3/4] rounded-xl overflow-hidden group border border-white/10"
                        >
                          <StorageImg
                            src={look.imageUrl}
                            alt={look.name}
                            className="w-full h-full object-cover object-top"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                              <p className="text-sm font-medium text-white">{look.name}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const charRef = generateReferenceName(name, '@');
                                  const lookRef = generateLookReferenceName(look.name);
                                  navigator.clipboard.writeText(`${charRef} ${lookRef}`);
                                }}
                                className="text-[10px] font-mono mt-0.5 flex items-center gap-1"
                                title="Copier la référence"
                              >
                                <span className="text-blue-400">{generateReferenceName(name, '@')}</span>
                                <span className="text-purple-400">{generateLookReferenceName(look.name)}</span>
                              </button>
                              {look.description && (
                                <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                                  {look.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 bg-black/50 text-white hover:bg-white/20"
                              onClick={(e) => {
                                e.stopPropagation();
                                const filename = `${name.replace(/\s+/g, '-').toLowerCase()}-${look.name.replace(/\s+/g, '-').toLowerCase()}.webp`;
                                const downloadUrl = `/api/download?url=${encodeURIComponent(look.imageUrl)}&filename=${encodeURIComponent(filename)}`;
                                const iframe = document.createElement('iframe');
                                iframe.style.display = 'none';
                                iframe.src = downloadUrl;
                                document.body.appendChild(iframe);
                                setTimeout(() => document.body.removeChild(iframe), 5000);
                              }}
                              title="Télécharger"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 bg-black/50 text-white hover:bg-red-500/80"
                              onClick={() => removeLook(look.id)}
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <Shirt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Aucun look ajouté</p>
                      <p className="text-xs mt-1">
                        Ajoutez des variations de tenue pour ce personnage
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Audio Tab */}
              {activeTab === 'audio' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Voix du personnage</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Sélectionnez une voix ElevenLabs pour ce personnage
                    </p>
                  </div>

                  {/* Selected voice */}
                  {voiceId && (
                    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-green-500/20">
                          <Volume2 className="w-5 h-5 text-green-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{voiceName}</p>
                          <p className="text-xs text-slate-400">Voix sélectionnée</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setVoiceId('');
                          setVoiceName('');
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Retirer
                      </Button>
                    </div>
                  )}

                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input
                      value={voiceSearch}
                      onChange={(e) => setVoiceSearch(e.target.value)}
                      placeholder="Rechercher une voix..."
                      className="pl-10 bg-white/5 border-white/10 text-white"
                    />
                  </div>

                  {/* Voices list */}
                  {loadingVoices ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                    </div>
                  ) : filteredVoices.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto scrollbar-none">
                      {filteredVoices.map((voice) => (
                        <div
                          key={voice.id}
                          className={cn(
                            'p-4 rounded-xl border transition-all cursor-pointer',
                            voiceId === voice.id
                              ? 'bg-blue-500/10 border-blue-500/50'
                              : 'bg-white/5 border-white/10 hover:border-white/20'
                          )}
                          onClick={() => selectVoice(voice)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {voice.name}
                              </p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {Object.entries(voice.labels).slice(0, 3).map(([key, value]) => (
                                  <span
                                    key={key}
                                    className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-slate-400"
                                  >
                                    {value}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 flex-shrink-0 text-slate-400 hover:text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                playVoicePreview(voice);
                              }}
                              disabled={generatingPreview}
                            >
                              {playingPreview === voice.id ? (
                                <Pause className="w-4 h-4" />
                              ) : generatingPreview ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                          </div>
                          {voiceId === voice.id && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-blue-400">
                              <Check className="w-3 h-3" />
                              Sélectionné
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500">
                      <Mic className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Aucune voix trouvée</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchVoices()}
                        className="mt-3 border-white/10"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Recharger
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <input
          ref={lookFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleLookFileSelect}
        />
        <audio ref={audioRef} className="hidden" />
      </DialogContent>

      {/* Gallery Picker for looks - two-step flow: select image, then enter name/description */}
      <GalleryPicker
        isOpen={showGalleryPicker}
        onClose={() => setShowGalleryPicker(false)}
        onSelect={handleGallerySelect}
        title="Choisir une image pour le look"
        requireLookInfo
      />
    </Dialog>
  );
}
