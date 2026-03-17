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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
        console.error('Character name is required');
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
          console.error('Failed to create character');
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

        // Now generate the requested view
        const result = await generateCharacterImages(characterId, {
          mode: 'generate_single',
          viewType,
          style,
        });

        if (result) {
          setReferenceImages(result);
        }
      } finally {
        setGeneratingView(null);
      }
    } else {
      // Character already exists
      setGeneratingView(viewType);
      try {
        const result = await generateCharacterImages(characterId, {
          mode: 'generate_single',
          viewType,
          style,
        });

        if (result) {
          setReferenceImages(result);
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
        <DialogHeader className="px-8 py-5 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/20">
                <User className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold text-white">
                  {isEditing ? 'Modifier le personnage' : 'Créer un personnage'}
                </DialogTitle>
                <DialogDescription className="text-sm text-slate-400 mt-0.5">
                  {isEditing
                    ? 'Modifiez les informations et les images de référence'
                    : `Ajoutez un personnage à votre bibliothèque. Référence: @${name.replace(/\s+/g, '') || 'nom'}`}
                </DialogDescription>
              </div>
            </div>

            {/* Action buttons in header */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                className="text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="w-4 h-4 mr-2" />
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!name.trim() || isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 min-w-[140px]"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : isEditing ? (
                  <Save className="w-4 h-4 mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                {isEditing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Main content - Two columns */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left column - Information */}
          <div className="w-[40%] border-r border-white/10 overflow-y-auto">
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
                    <p className="text-xs text-slate-500">
                      Cette description sera utilisée pour générer les images de référence avec l'IA.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right column - Tabs */}
          <div className="w-[60%] flex flex-col overflow-hidden bg-[#0a0f16]">
            {/* Tab buttons */}
            <div className="flex items-center gap-1 px-8 py-4 border-b border-white/10">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                      activeTab === tab.value
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                    {tab.value === 'looks' && looks.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-white/10 rounded">
                        {looks.length}
                      </span>
                    )}
                    {tab.value === 'audio' && voiceId && (
                      <Check className="w-3 h-3 text-green-400" />
                    )}
                  </button>
                );
              })}

              {/* Style selector - only for references tab */}
              {activeTab === 'references' && isEditing && (
                <div className="ml-auto">
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger className="w-44 h-9 bg-white/5 border-white/10 text-white text-sm">
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
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-8">
              {/* References Tab */}
              {activeTab === 'references' && (
                <div className="space-y-6">
                  {/* Main 3 views grid */}
                  <div className="grid grid-cols-3 gap-4">
                    {IMAGE_TYPES.slice(0, 3).map((imageType) => {
                      const existingImage = referenceImages.find((img) => img.type === imageType.value);
                      const isGeneratingThis = generatingView === imageType.value;

                      const isUploadingThis = uploadingImageType === imageType.value;

                      return (
                        <div
                          key={imageType.value}
                          className={cn(
                            'relative aspect-[3/4] rounded-xl border-2 border-dashed group transition-all cursor-pointer',
                            existingImage
                              ? 'border-green-500/50 bg-green-500/5'
                              : 'border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-blue-500/5'
                          )}
                          style={{ clipPath: 'inset(0 round 12px)' }}
                          onClick={() => !isGeneratingThis && !isUploadingThis && handleImageSlotClick(imageType.value)}
                        >
                          {isGeneratingThis || isUploadingThis ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                              <span className="text-sm text-slate-400">
                                {isUploadingThis ? 'Upload...' : 'Génération...'}
                              </span>
                            </div>
                          ) : existingImage ? (
                            <>
                              <StorageImg
                                src={existingImage.url}
                                alt={imageType.label}
                                className="absolute inset-0 w-full h-full object-contain rounded-xl"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 rounded-xl">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-white hover:bg-white/20 rounded-lg"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      triggerUpload(imageType.value);
                                    }}
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
                              <div className="absolute top-3 right-3 p-1 rounded-full bg-green-500/90">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4">
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

                  {/* Additional views (3/4 and custom) */}
                  <div className="grid grid-cols-2 gap-4">
                    {IMAGE_TYPES.slice(3).map((imageType) => {
                      const existingImage = referenceImages.find((img) => img.type === imageType.value);
                      const isGeneratingThis = generatingView === imageType.value;
                      const isUploadingThis = uploadingImageType === imageType.value;

                      return (
                        <div
                          key={imageType.value}
                          className={cn(
                            'relative aspect-[4/3] rounded-xl border-2 border-dashed group transition-all cursor-pointer',
                            existingImage
                              ? 'border-green-500/50 bg-green-500/5'
                              : 'border-white/10 bg-white/5 hover:border-blue-500/50 hover:bg-blue-500/5'
                          )}
                          style={{ clipPath: 'inset(0 round 12px)' }}
                          onClick={() => !isGeneratingThis && !isUploadingThis && handleImageSlotClick(imageType.value)}
                        >
                          {isGeneratingThis || isUploadingThis ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                              <span className="text-xs text-slate-400">
                                {isUploadingThis ? 'Upload...' : 'Génération...'}
                              </span>
                            </div>
                          ) : existingImage ? (
                            <>
                              <StorageImg
                                src={existingImage.url}
                                alt={imageType.label}
                                className="absolute inset-0 w-full h-full object-contain rounded-xl"
                              />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-xl">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-white hover:bg-white/20 rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerUpload(imageType.value);
                                  }}
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-red-400 hover:bg-red-500/20 rounded-lg"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeImage(imageType.value);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                              <div className="absolute bottom-2 left-2">
                                <span className="text-xs text-white font-medium px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm">
                                  {imageType.label}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-3">
                              <span className="text-sm font-medium text-white">{imageType.label}</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="border-white/20 text-slate-300 hover:bg-white/10 hover:text-white h-8 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerUpload(imageType.value);
                                  }}
                                >
                                  <Upload className="w-3.5 h-3.5 mr-1" />
                                  Upload
                                </Button>
                                {canGenerate && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 h-8 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleGenerateSingle(imageType.value);
                                    }}
                                    disabled={isGenerating}
                                  >
                                    <Wand2 className="w-3.5 h-3.5 mr-1" />
                                    IA
                                  </Button>
                                )}
                              </div>
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
                      <div className="flex gap-3">
                        <Button
                          onClick={() => lookFileInputRef.current?.click()}
                          disabled={!newLookName.trim() || uploadingLook || generatingLook}
                          variant="outline"
                          className="flex-1 border-white/20 text-slate-300 hover:bg-white/10 hover:border-white/30"
                        >
                          {uploadingLook ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4 mr-2" />
                          )}
                          Uploader une image
                        </Button>
                        {isEditing && (
                          <Button
                            onClick={handleGenerateLook}
                            disabled={!newLookDescription.trim() || uploadingLook || generatingLook}
                            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            {generatingLook ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Wand2 className="w-4 h-4 mr-2" />
                            )}
                            Générer avec l'IA
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
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
                            <div className="absolute bottom-0 left-0 right-0 p-3">
                              <p className="text-sm font-medium text-white">{look.name}</p>
                              {look.description && (
                                <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">
                                  {look.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute top-2 right-2 h-8 w-8 bg-black/50 text-white hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => removeLook(look.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
                    <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
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
    </Dialog>
  );
}
