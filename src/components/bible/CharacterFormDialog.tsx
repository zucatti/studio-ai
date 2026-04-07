'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  type RushImage,
} from '@/store/bible-store';
import { useJobsStore, type GenerationJob } from '@/store/jobs-store';
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
  Square,
  Search,
  Volume2,
  Pause,
  Images,
  Download,
  Clock,
  Circle,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
} from 'lucide-react';
import { GalleryPicker } from '@/components/gallery/GalleryPicker';
import { MultiImageGenerator } from '@/components/ui/multi-image-generator';
import { generateReferenceName, generateLookReferenceName } from '@/lib/reference-name';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { invalidateMentionCache } from '@/components/ui/mention-input';

interface CharacterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character?: GlobalAsset | null;
  onSuccess?: (character: GlobalAsset) => void;
  projectId?: string;
}

interface ElevenLabsVoice {
  id: string;
  name: string;
  labels: Record<string, string>;
  previewUrl?: string;
  category: string;
  isLibrary?: boolean;
  publicOwnerId?: string;
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
  { value: 'gpt-image-1.5', label: 'GPT 4.5' },
  { value: 'flux-2-pro', label: 'Flux Pro' },
] as const;

const RESOLUTION_OPTIONS = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
] as const;

const ASPECT_RATIO_OPTIONS = [
  { value: '9:16', label: '9:16', width: 9, height: 16 },
  { value: '2:3', label: '2:3', width: 2, height: 3 },
  { value: '4:5', label: '4:5', width: 4, height: 5 },
  { value: '1:1', label: '1:1', width: 1, height: 1 },
  { value: '16:9', label: '16:9', width: 16, height: 9 },
  { value: '21:9', label: '21:9', width: 21, height: 9 },
] as const;

type ModelType = typeof MODEL_OPTIONS[number]['value'];
type AspectRatioType = typeof ASPECT_RATIO_OPTIONS[number]['value'];

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
  projectId,
}: CharacterFormDialogProps) {
  const isEditing = !!character;

  const {
    createCharacter,
    updateCharacter,
    generateCharacterImages,
    queueCharacterImageGeneration,
    uploadCharacterImage,
    isGenerating,
    isAssetInProject,
    importGlobalAsset,
  } = useBibleStore();

  // Check if character is already in project
  const isInProject = character && projectId ? isAssetInProject(character.id) : false;
  const [isImporting, setIsImporting] = useState(false);

  const handleImportToProject = async () => {
    if (!character || !projectId || isInProject) return;
    setIsImporting(true);
    try {
      await importGlobalAsset(projectId, character.id);
      toast.success(`${character.name} ajouté au projet`);
    } catch (error) {
      toast.error("Erreur lors de l'ajout au projet");
    } finally {
      setIsImporting(false);
    }
  };

  // Selected looks for project
  const [selectedLookIds, setSelectedLookIds] = useState<Set<string>>(new Set());
  const [loadingLookId, setLoadingLookId] = useState<string | null>(null);

  // Fetch selected looks when dialog opens
  useEffect(() => {
    if (open && character && projectId) {
      fetch(`/api/projects/${projectId}/assets/${character.id}/looks`)
        .then(res => res.json())
        .then(data => {
          setSelectedLookIds(new Set(data.selectedLookIds || []));
        })
        .catch(err => console.error('Error fetching selected looks:', err));
    }
  }, [open, character, projectId]);

  const handleToggleLook = async (lookId: string) => {
    if (!character || !projectId) return;

    setLoadingLookId(lookId);
    const isSelected = selectedLookIds.has(lookId);

    try {
      if (isSelected) {
        // Remove look
        const res = await fetch(
          `/api/projects/${projectId}/assets/${character.id}/looks?lookId=${lookId}`,
          { method: 'DELETE' }
        );
        if (res.ok) {
          setSelectedLookIds(prev => {
            const next = new Set(prev);
            next.delete(lookId);
            return next;
          });
          // Invalidate mention cache so dropdown updates
          invalidateMentionCache(projectId);
          toast.success('Look retiré du projet');
        }
      } else {
        // Add look
        const res = await fetch(
          `/api/projects/${projectId}/assets/${character.id}/looks`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lookId }),
          }
        );
        if (res.ok) {
          setSelectedLookIds(prev => new Set([...prev, lookId]));
          // Invalidate mention cache so dropdown updates
          invalidateMentionCache(projectId);
          toast.success('Look ajouté au projet');
        }
      }
    } catch (error) {
      toast.error('Erreur lors de la modification');
    } finally {
      setLoadingLookId(null);
    }
  };

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
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('2:3');
  const useQueue = true; // Always use queue mode

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
  const [isGeneratingMatrix, setIsGeneratingMatrix] = useState(false);
  const [characterMatrixUrl, setCharacterMatrixUrl] = useState<string | null>(
    (character?.data as CharacterData)?.character_matrix_url || null
  );

  // Rushes state - previous generations for comparison/selection
  const [rushes, setRushes] = useState<RushImage[]>(
    (character?.data as CharacterData)?.rushes || []
  );
  const [showRushesFor, setShowRushesFor] = useState<CharacterImageType | null>(null);

  // Selected source image for modification
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string | null>(null);

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
  const [falVoiceId, setFalVoiceId] = useState((character?.data as CharacterData)?.fal_voice_id || '');
  const [falVoiceSampleUrl, setFalVoiceSampleUrl] = useState((character?.data as CharacterData)?.fal_voice_sample_url || '');
  const [creatingFalVoice, setCreatingFalVoice] = useState(false);
  const [playingSample, setPlayingSample] = useState(false);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lookFileInputRef = useRef<HTMLInputElement>(null);

  // Jobs store for tracking pending generations
  const { jobs, startPolling, fetchJobs } = useJobsStore();

  // Track pending jobs for this character's view types
  const pendingJobsByView = useMemo(() => {
    if (!character?.id) return new Map<CharacterImageType, GenerationJob>();

    const map = new Map<CharacterImageType, GenerationJob>();
    const characterJobs = jobs.filter(
      (job) =>
        job.asset_id === character.id &&
        job.job_type === 'image' &&
        ['pending', 'queued', 'running'].includes(job.status)
    );

    for (const job of characterJobs) {
      const viewType = job.job_subtype as CharacterImageType;
      if (viewType && IMAGE_TYPES.some((t) => t.value === viewType)) {
        map.set(viewType, job);
      }
    }
    return map;
  }, [jobs, character?.id]);

  // Track pending jobs for looks
  const pendingLookJobs = useMemo(() => {
    if (!character?.id) return [] as GenerationJob[];

    return jobs.filter(
      (job) =>
        job.asset_id === character.id &&
        job.job_type === 'image' &&
        job.job_subtype === 'look' &&
        ['pending', 'queued', 'running'].includes(job.status)
    );
  }, [jobs, character?.id]);

  // Listen for job-completed events to refresh images
  useEffect(() => {
    if (!character?.id || !open) return;

    const handleJobCompleted = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        jobId: string;
        assetId: string;
        assetType: string;
        jobType: string;
        jobSubtype: string;
      }>;
      const { assetId, jobType, jobSubtype } = customEvent.detail;

      // Check if this job is for our character
      if (assetId !== character.id || jobType !== 'image') return;

      console.log(`[CharacterForm] Job completed for view: ${jobSubtype}`);

      // Fetch updated character data to get new images, rushes, and looks
      const res = await fetch(`/api/global-assets/${character.id}`);
      if (res.ok) {
        const data = await res.json();
        const newImages = data.asset?.data?.reference_images_metadata || [];
        const newRushes = data.asset?.data?.rushes || [];
        const newLooks = data.asset?.data?.looks || [];
        setReferenceImages(newImages);
        setRushes(newRushes);
        setLooks(newLooks);

        if (jobSubtype === 'look') {
          toast.success('Look généré avec succès!');
          // Clear the form after successful generation
          setNewLookName('');
          setNewLookDescription('');
        } else {
          toast.success(`Image "${jobSubtype}" générée avec succès!`);
        }
      }
    };

    window.addEventListener('job-completed', handleJobCompleted);

    // Start polling when dialog is open
    startPolling();
    fetchJobs();

    return () => {
      window.removeEventListener('job-completed', handleJobCompleted);
    };
  }, [character?.id, open, startPolling, fetchJobs]);

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
      setRushes(data?.rushes || []);
      setLooks(data?.looks || []);
      setCharacterMatrixUrl(data?.character_matrix_url || null);
      setVoiceId(data?.voice_id || '');
      setVoiceName(data?.voice_name || '');
      setFalVoiceId(data?.fal_voice_id || '');
      setFalVoiceSampleUrl(data?.fal_voice_sample_url || '');
    } else {
      setName('');
      setDescription('');
      setVisualDescription('');
      setAge('');
      setGender('');
      setTags('');
      setReferenceImages([]);
      setRushes([]);
      setLooks([]);
      setCharacterMatrixUrl(null);
      setVoiceId('');
      setVoiceName('');
      setFalVoiceId('');
    }
    setStyle('photorealistic');
    setActiveTab('references');
    setSavedCharacterId(null);
    setShowRushesFor(null);
    setPendingFiles(new Map());
    setSelectedSourceUrl(null);
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

  // Debounced search for voices (includes Voice Library when searching)
  useEffect(() => {
    if (activeTab !== 'audio') return;

    // Only search server-side when we have at least 2 characters
    if (voiceSearch.length >= 2) {
      const timeoutId = setTimeout(() => {
        fetchVoices(voiceSearch);
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (voiceSearch.length === 0) {
      // Reset to all personal voices when search is cleared
      fetchVoices();
    }
  }, [voiceSearch, activeTab]);

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

  // Count rushes for a specific type
  const getRushCountForType = useCallback(
    (imageType: CharacterImageType) => {
      return rushes.filter((r) => r.type === imageType).length;
    },
    [rushes]
  );

  // Get rushes for a specific type (sorted by date, newest first)
  const getRushesForType = useCallback(
    (imageType: CharacterImageType) => {
      return rushes
        .filter((r) => r.type === imageType)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    [rushes]
  );

  // Delete a specific rush
  const deleteRush = async (rushUrl: string) => {
    const characterId = character?.id || savedCharacterId;
    if (!characterId) return;

    const newRushes = rushes.filter((r) => r.url !== rushUrl);
    setRushes(newRushes);

    // Update in database
    try {
      await fetch(`/api/global-assets/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            ...(character?.data as CharacterData),
            reference_images_metadata: referenceImages,
            rushes: newRushes,
          },
        }),
      });
      toast.success('Rush supprimé');
    } catch (error) {
      console.error('Error deleting rush:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Promote a rush to be the main image (swap with current)
  const promoteRush = async (rush: RushImage) => {
    const characterId = character?.id || savedCharacterId;
    if (!characterId) return;

    const imageType = rush.type as CharacterImageType;
    const currentImage = referenceImages.find((img) => img.type === imageType);

    // New rushes array: remove the promoted rush, add current image if exists
    let newRushes = rushes.filter((r) => r.url !== rush.url);
    if (currentImage) {
      newRushes = [
        {
          url: currentImage.url,
          type: currentImage.type,
          label: currentImage.label,
          createdAt: new Date().toISOString(),
        },
        ...newRushes,
      ];
    }

    // New reference images: replace or add the promoted image
    const newReferenceImages = [...referenceImages];
    const existingIndex = newReferenceImages.findIndex((img) => img.type === imageType);
    const newImage: ReferenceImage = {
      url: rush.url,
      type: imageType,
      label: rush.label,
    };

    if (existingIndex >= 0) {
      newReferenceImages[existingIndex] = newImage;
    } else {
      newReferenceImages.push(newImage);
    }

    setReferenceImages(newReferenceImages);
    setRushes(newRushes);

    // Update in database
    try {
      await fetch(`/api/global-assets/${characterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_images: newReferenceImages.map((img) => img.url),
          data: {
            ...(character?.data as CharacterData),
            reference_images_metadata: newReferenceImages,
            rushes: newRushes,
          },
        }),
      });
      toast.success('Image mise en avant');
    } catch (error) {
      console.error('Error promoting rush:', error);
      toast.error('Erreur lors de la mise en avant');
    }
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
    // Always use the front image as reference for character consistency
    const existingFrontImage = referenceImages.find((img) => img.type === 'front');
    const sourceImageUrl = existingFrontImage?.url;

    // Clear selection immediately when starting generation
    setSelectedSourceUrl(null);

    if (useQueue) {
      // Queue mode - show immediate feedback, then submit job
      setGeneratingView(viewType);
      const viewLabel = IMAGE_TYPES.find((t) => t.value === viewType)?.label || viewType;
      toast.loading(`Préparation de "${viewLabel}"...`, { id: `prep-${viewType}` });

      const jobId = await queueCharacterImageGeneration({
        assetId: characterId,
        assetName: name,
        viewType,
        style,
        model: selectedModel,
        resolution,
        visualDescription,
        sourceImageUrl, // Pass existing front image for modification
      });

      setGeneratingView(null);
      toast.dismiss(`prep-${viewType}`);

      if (jobId) {
        toast.success(`"${viewLabel}" ajouté à la file d'attente`, {
          description: 'Vous pouvez continuer à travailler.',
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

  // Generate look with AI (using queue system)
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
          aspectRatio,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // If using queue system, the job will be tracked via pendingLookJobs
        if (data.jobId) {
          toast.success('Génération du look en cours...');
          // Refresh jobs to get the new one and start polling
          await fetchJobs();
          startPolling();
        } else if (data.look) {
          // Fallback for synchronous response
          setLooks((prev) => [...prev, data.look]);
          setNewLookName('');
          setNewLookDescription('');
        }
      } else {
        const error = await res.json();
        console.error('Error generating look:', error);
        toast.error(error.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Error generating look:', error);
      toast.error('Erreur lors de la génération');
    } finally {
      setGeneratingLook(false);
    }
  };

  // Generate character matrix (2048x2048 composite with front/profile/3-4/back)
  const handleGenerateMatrix = async () => {
    if (!character?.id) {
      toast.error('Le personnage doit être enregistré avant de générer le matrix');
      return;
    }

    // Check we have all 4 required views
    const requiredTypes = ['front', 'profile', 'three_quarter', 'back'];
    const missingTypes = requiredTypes.filter(type => !referenceImages.find(img => img.type === type));
    if (missingTypes.length > 0) {
      toast.error(`Images manquantes: ${missingTypes.join(', ')}`);
      return;
    }

    setIsGeneratingMatrix(true);
    console.log('[CharacterFormDialog] Generating matrix for character:', character.id, character.name);
    try {
      const response = await fetch(`/api/global-assets/${character.id}/generate-matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isGenericAsset: false,
        }),
      });

      const data = await response.json();

      if (response.ok && data.characterMatrixUrl) {
        toast.success('Character Matrix généré !');
        // Update local state immediately
        setCharacterMatrixUrl(data.characterMatrixUrl);
        // Also update the store so it persists when dialog closes
        const existingData = (character.data as CharacterData) || {};
        console.log('[CharacterFormDialog] Saving matrix to store:', {
          characterId: character.id,
          matrixUrl: data.characterMatrixUrl,
          existingDataKeys: Object.keys(existingData),
        });
        const updatedAsset = await updateCharacter(character.id, {
          data: {
            ...existingData,
            character_matrix_url: data.characterMatrixUrl,
          },
        });
        console.log('[CharacterFormDialog] updateCharacter result:', {
          success: !!updatedAsset,
          newMatrixUrl: (updatedAsset?.data as CharacterData)?.character_matrix_url,
        });
      } else {
        toast.error(data.error || 'Erreur lors de la génération');
      }
    } catch (error) {
      console.error('Error generating matrix:', error);
      toast.error('Erreur lors de la génération du matrix');
    } finally {
      setIsGeneratingMatrix(false);
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

  // Create fal.ai voice from ElevenLabs voice
  const createFalVoice = async (characterId: string) => {
    setCreatingFalVoice(true);
    try {
      const res = await fetch(`/api/global-assets/${characterId}/create-fal-voice`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create fal.ai voice');
      }

      setFalVoiceId(data.voice_id);
      if (data.sample_url) {
        setFalVoiceSampleUrl(data.sample_url);
      }
      toast.success('Voix Kling créée avec succès');
    } catch (error) {
      console.error('Error creating fal voice:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de la création de la voix Kling');
    } finally {
      setCreatingFalVoice(false);
    }
  };

  // Play voice sample
  const playVoiceSample = async () => {
    if (!falVoiceSampleUrl) return;

    if (playingSample && sampleAudioRef.current) {
      sampleAudioRef.current.pause();
      sampleAudioRef.current.currentTime = 0;
      setPlayingSample(false);
      return;
    }

    try {
      // Get signed URL if it's a B2 URL
      let audioUrl = falVoiceSampleUrl;
      if (falVoiceSampleUrl.startsWith('b2://')) {
        const signRes = await fetch('/api/storage/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: [falVoiceSampleUrl] }),
        });
        if (signRes.ok) {
          const signData = await signRes.json();
          audioUrl = signData.signedUrls?.[falVoiceSampleUrl] || falVoiceSampleUrl;
        }
      }

      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
      }
      sampleAudioRef.current = new Audio(audioUrl);
      sampleAudioRef.current.onended = () => setPlayingSample(false);
      sampleAudioRef.current.onerror = () => {
        setPlayingSample(false);
        toast.error('Erreur de lecture audio');
      };
      setPlayingSample(true);
      await sampleAudioRef.current.play();
    } catch (error) {
      console.error('Error playing sample:', error);
      setPlayingSample(false);
    }
  };

  // Select a voice and automatically create fal.ai voice
  const selectVoice = async (voice: ElevenLabsVoice) => {
    let finalVoiceId = voice.id;
    let finalVoiceName = voice.name;

    // If it's a library voice, add it to the user's collection first
    if (voice.isLibrary && voice.publicOwnerId) {
      toast.info('Ajout de la voix à votre collection...', { duration: 2000 });

      try {
        const addRes = await fetch('/api/elevenlabs/voices/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicUserId: voice.publicOwnerId,
            voiceId: voice.id,
            name: voice.name,
          }),
        });

        if (addRes.ok) {
          const addData = await addRes.json();
          finalVoiceId = addData.voiceId;
          toast.success('Voix ajoutée à votre collection !');
        } else {
          const error = await addRes.json();
          toast.error(`Erreur: ${error.error || 'Impossible d\'ajouter la voix'}`);
          return;
        }
      } catch (error) {
        console.error('Error adding library voice:', error);
        toast.error('Erreur lors de l\'ajout de la voix');
        return;
      }
    }

    setVoiceId(finalVoiceId);
    setVoiceName(finalVoiceName);
    setFalVoiceId(''); // Reset fal voice since we're changing ElevenLabs voice
    setFalVoiceSampleUrl(''); // Reset sample URL

    // Auto-create fal.ai voice if character is already saved
    const characterId = character?.id || savedCharacterId;
    if (characterId) {
      // First save the voice to the character, then create fal voice
      try {
        const existingData = (character?.data as CharacterData) || {};
        await updateCharacter(characterId, {
          data: {
            ...existingData,
            voice_id: finalVoiceId,
            voice_name: finalVoiceName,
          },
        });
        // Now create fal voice
        await createFalVoice(characterId);
      } catch (error) {
        console.error('Error saving voice:', error);
      }
    }
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
      fal_voice_id: falVoiceId || undefined,
      fal_voice_sample_url: falVoiceSampleUrl || undefined,
      character_matrix_url: characterMatrixUrl || undefined,
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

  // Get the selected source image and its type
  const selectedSourceImage = selectedSourceUrl
    ? referenceImages.find((img) => img.url === selectedSourceUrl)
    : null;
  const selectedViewType = selectedSourceImage?.type || 'front';

  // Normalize string for accent-insensitive search
  const normalize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Filter voices based on search (accent-insensitive, word-based)
  // Note: When search >= 2 chars, server already filters including Voice Library
  // Only do client-side filtering for very short searches (1 char)
  const filteredVoices = voiceSearch && voiceSearch.length < 2
    ? voices.filter((v) => {
        const searchWords = normalize(voiceSearch).split(/[\s\-]+/).filter(w => w.length > 0);
        const fullText = `${normalize(v.name)} ${Object.values(v.labels).map(l => normalize(l)).join(' ')}`;
        return searchWords.every(word => fullText.includes(word));
      })
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
              {/* Import to project button */}
              {isEditing && projectId && (
                isInProject ? (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-400 bg-green-500/10 rounded-lg border border-green-500/30">
                    <Check className="w-4 h-4" />
                    Dans le projet
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportToProject}
                    disabled={isImporting}
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10 hover:text-green-300"
                  >
                    {isImporting ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1.5" />
                    )}
                    Ajouter au projet
                  </Button>
                )
              )}
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
          {/* Left column - Information (only shown on references tab) */}
          {activeTab === 'references' && (
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
                      {selectedSourceUrl || hasFrontImage ? 'Modifications à apporter' : 'Description visuelle'}{' '}
                      {!selectedSourceUrl && !hasFrontImage && <span className="text-red-400">*</span>}
                      {selectedSourceUrl && (
                        <span className="text-yellow-500 text-xs font-normal ml-2">
                          ({IMAGE_TYPES.find((t) => t.value === selectedViewType)?.label} sélectionnée)
                        </span>
                      )}
                    </Label>
                    <Textarea
                      id="visual_description"
                      value={visualDescription}
                      onChange={(e) => setVisualDescription(e.target.value)}
                      placeholder={
                        selectedSourceUrl || hasFrontImage
                          ? "Décrivez les modifications: expression neutre, en tenue de soirée, sans lunettes, cheveux attachés..."
                          : "Décrivez l'apparence physique: cheveux, yeux, morphologie, vêtements typiques, style vestimentaire..."
                      }
                      className="bg-white/5 border-white/10 text-white min-h-[140px] resize-none"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-4">
                        <p className="text-xs text-slate-500">
                          {selectedSourceUrl && selectedViewType !== 'front'
                            ? `L'IA utilisera la face comme référence et régénérera "${IMAGE_TYPES.find((t) => t.value === selectedViewType)?.label}".`
                            : hasFrontImage
                            ? "L'IA partira de l'image de face et appliquera vos modifications."
                            : "Cette description sera utilisée pour générer les images de référence avec l'IA."}
                        </p>
                        {selectedSourceUrl && (
                          <button
                            onClick={() => setSelectedSourceUrl(null)}
                            className="text-xs text-yellow-500 hover:text-yellow-400 mt-1 flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            Désélectionner (revenir à Face)
                          </button>
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={() => handleGenerateSingle(selectedViewType)}
                        disabled={!visualDescription.trim() || !name.trim() || generatingView === selectedViewType || isGenerating}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg shadow-purple-500/25"
                      >
                        {generatingView === selectedViewType ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {selectedSourceUrl || hasFrontImage ? 'Modification...' : 'Génération...'}
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4 mr-2" />
                            {selectedSourceUrl
                              ? `Modifier ${IMAGE_TYPES.find((t) => t.value === selectedViewType)?.label || 'l\'image'}`
                              : hasFrontImage
                              ? 'Modifier le visage'
                              : 'Générer le visage IA'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Right column - Tab content */}
          <div className={cn(
            "flex flex-col overflow-hidden bg-[#0a0f16]",
            activeTab === 'references' ? 'w-[60%]' : 'w-full'
          )}>
            {/* Model + Resolution + Style selectors - visible on references and looks tabs */}
            {(activeTab === 'references' || activeTab === 'looks') && (
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
                {/* Aspect ratio toggle - only on looks tab */}
                {activeTab === 'looks' && (
                  <div className="inline-flex rounded-md bg-white/5 p-0.5 border border-white/10 items-center gap-0.5">
                    {ASPECT_RATIO_OPTIONS.map((ar) => {
                      const maxDim = 14;
                      const scale = maxDim / Math.max(ar.width, ar.height);
                      const w = Math.round(ar.width * scale);
                      const h = Math.round(ar.height * scale);
                      return (
                        <button
                          key={ar.value}
                          onClick={() => setAspectRatio(ar.value)}
                          className={cn(
                            'px-1.5 py-1 text-xs font-medium rounded transition-all flex items-center gap-1',
                            aspectRatio === ar.value
                              ? 'bg-orange-500 text-white'
                              : 'text-slate-400 hover:text-white'
                          )}
                          title={ar.label}
                        >
                          <div
                            className={cn(
                              'border rounded-sm',
                              aspectRatio === ar.value ? 'border-white' : 'border-slate-500'
                            )}
                            style={{ width: w, height: h }}
                          />
                          <span className="text-[10px]">{ar.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
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
                {/* Queue toggle - only on references tab */}
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
                      const pendingJob = pendingJobsByView.get(imageType.value);
                      const hasPendingJob = !!pendingJob;
                      const isProcessing = isGeneratingThis || isUploadingThis || hasPendingJob;

                      return (
                        <div
                          key={imageType.value}
                          className={cn(
                            'relative rounded-xl group transition-all cursor-pointer break-inside-avoid mb-4 overflow-hidden',
                            hasPendingJob
                              ? 'ring-2 ring-purple-500/50'
                              : existingImage && selectedSourceUrl === existingImage.url
                              ? 'ring-2 ring-yellow-500 shadow-lg shadow-yellow-500/20'
                              : existingImage
                              ? 'ring-1 ring-white/20'
                              : 'border-2 border-dashed border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          )}
                          onClick={() => !isProcessing && handleImageSlotClick(imageType.value)}
                        >
                          {hasPendingJob ? (
                            // Rainbow animation for queued jobs
                            <div className="aspect-[3/4] relative overflow-hidden rounded-xl">
                              {/* Animated rainbow radial gradient background */}
                              <div className="absolute inset-0 rainbow-radial-animation" />
                              {/* Dark overlay for readability */}
                              <div className="absolute inset-0 bg-black/30" />
                              {/* Content */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                {/* Icon with pulsing ring */}
                                <div className="relative">
                                  <Wand2 className="w-8 h-8 text-white/80" />
                                  <div className="absolute inset-0 -m-2 rounded-full border-2 border-white/30 animate-ping" />
                                </div>
                                {/* Status message */}
                                <span className="text-sm font-medium text-white">
                                  {pendingJob.status === 'running' ? 'Génération...' : 'En file...'}
                                </span>
                                {/* View type label */}
                                <span className="text-xs text-white/70 bg-black/40 px-2 py-0.5 rounded">
                                  {imageType.label}
                                </span>
                                {/* Progress if available */}
                                {pendingJob.progress > 0 && (
                                  <span className="text-lg font-bold text-white/90">
                                    {Math.round(pendingJob.progress)}%
                                  </span>
                                )}
                              </div>
                              {/* Progress bar at bottom */}
                              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/50">
                                <div
                                  className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-300 ease-out"
                                  style={{ width: `${pendingJob.progress || 5}%` }}
                                />
                              </div>
                            </div>
                          ) : isGeneratingThis || isUploadingThis ? (
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
                              {/* Selection circle in top-left */}
                              <button
                                className={cn(
                                  'absolute top-2 left-2 z-10 rounded-full transition-all',
                                  selectedSourceUrl === existingImage.url
                                    ? 'text-yellow-500 scale-110'
                                    : 'text-white/50 hover:text-white/80 opacity-0 group-hover:opacity-100'
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSourceUrl(
                                    selectedSourceUrl === existingImage.url ? null : existingImage.url
                                  );
                                }}
                                title={selectedSourceUrl === existingImage.url ? 'Désélectionner' : 'Utiliser comme source pour la modification'}
                              >
                                {selectedSourceUrl === existingImage.url ? (
                                  <CheckCircle2 className="w-6 h-6 drop-shadow-lg" />
                                ) : (
                                  <Circle className="w-6 h-6 drop-shadow-lg" />
                                )}
                              </button>
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
                              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                                <span className="text-sm text-white font-medium px-2 py-1 rounded-md bg-black/70 backdrop-blur-sm">
                                  {imageType.label}
                                </span>
                                {getRushCountForType(imageType.value) > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-amber-400 hover:bg-amber-500/20 bg-black/70 backdrop-blur-sm rounded-md"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowRushesFor(imageType.value);
                                    }}
                                    title="Voir les rushes précédents"
                                  >
                                    <Clock className="w-3.5 h-3.5 mr-1" />
                                    <span className="text-xs">{getRushCountForType(imageType.value)}</span>
                                  </Button>
                                )}
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

                  {/* Character Matrix Section */}
                  {isEditing && referenceImages.filter(img => ['front', 'profile', 'three_quarter', 'back'].includes(img.type)).length >= 4 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h4 className="text-sm font-medium text-white flex items-center gap-2">
                            <LayoutGrid className="w-4 h-4 text-purple-400" />
                            Character Matrix
                          </h4>
                          <p className="text-xs text-slate-500 mt-1">
                            Image composite 2048x2048 avec les 4 vues
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateMatrix}
                          disabled={isGeneratingMatrix}
                          className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                        >
                          {isGeneratingMatrix ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Génération...
                            </>
                          ) : characterMatrixUrl ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Régénérer
                            </>
                          ) : (
                            <>
                              <LayoutGrid className="w-4 h-4 mr-2" />
                              Générer Matrix
                            </>
                          )}
                        </Button>
                      </div>

                      {characterMatrixUrl ? (
                        <div className="relative rounded-xl overflow-hidden border border-purple-500/30">
                          <StorageImg
                            src={characterMatrixUrl}
                            alt={`${name} - Character Matrix`}
                            className="w-full aspect-square object-cover"
                          />
                          <div className="absolute top-2 left-2 px-2 py-1 bg-purple-500/80 rounded text-xs text-white font-medium">
                            2048×2048
                          </div>
                        </div>
                      ) : (
                        <div className="w-full aspect-square rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center">
                          <div className="text-center text-slate-500">
                            <LayoutGrid className="w-10 h-10 mx-auto mb-2 opacity-50" />
                            <p className="text-xs">Pas de matrix généré</p>
                            <p className="text-xs mt-1 text-slate-600">Cliquez sur &quot;Générer Matrix&quot;</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                      </div>

                      {/* Multi-image generation */}
                      {isEditing && (
                        <MultiImageGenerator
                          aspectRatio={aspectRatio}
                          initialCount={4}
                          compact
                          disabled={!newLookDescription.trim() || uploadingLook}
                          generateButtonText="Générer"
                          confirmButtonText="Garder"
                          multiSelect
                          onGenerate={async (count) => {
                            // Generate multiple images and return job IDs
                            const jobIds: string[] = [];
                            for (let i = 0; i < count; i++) {
                              const res = await fetch(`/api/global-assets/${character!.id}/generate-images`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  mode: 'generate_look',
                                  lookName: newLookName.trim() || `Look ${i + 1}`,
                                  lookDescription: newLookDescription.trim(),
                                  style,
                                  model: selectedModel,
                                  resolution,
                                  aspectRatio,
                                }),
                              });
                              if (res.ok) {
                                const data = await res.json();
                                if (data.jobId) {
                                  jobIds.push(data.jobId);
                                }
                              }
                            }
                            return jobIds;
                          }}
                          onPollJob={async (jobId) => {
                            const res = await fetch(`/api/jobs/${jobId}`);
                            if (!res.ok) throw new Error('Failed to fetch job');
                            const data = await res.json();
                            const job = data.job || data;
                            // Extract imageUrl from various possible locations
                            const resultData = job.result_data || job.output_data || {};
                            let imageUrl = resultData.imageUrl;
                            // fal.ai format: images[0].url
                            if (!imageUrl && resultData.images && Array.isArray(resultData.images) && resultData.images[0]) {
                              imageUrl = resultData.images[0].url;
                            }
                            return {
                              status: job.status,
                              progress: job.progress,
                              imageUrl,
                            };
                          }}
                          onSelect={(imageUrls) => {
                            // Add selected images as looks
                            const baseName = newLookName.trim() || 'Look généré';
                            const newLooks = imageUrls.map((url, i) => ({
                              id: crypto.randomUUID(),
                              name: imageUrls.length > 1 ? `${baseName} ${i + 1}` : baseName,
                              description: newLookDescription.trim(),
                              imageUrl: url,
                            }));
                            setLooks((prev) => [...prev, ...newLooks]);
                            setNewLookName('');
                            setNewLookDescription('');
                            toast.success(`${newLooks.length} look${newLooks.length > 1 ? 's' : ''} ajouté${newLooks.length > 1 ? 's' : ''}`);
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Looks masonry grid */}
                  {looks.length > 0 || pendingLookJobs.length > 0 ? (
                    <div className="columns-4 gap-3 space-y-3">
                      {/* Pending look jobs with rainbow animation */}
                      {pendingLookJobs.map((job) => {
                        // Get aspect ratio from job input_data or default
                        const jobAspectRatio = (job.input_data?.aspectRatio as string) || '2:3';
                        const arConfig = ASPECT_RATIO_OPTIONS.find(ar => ar.value === jobAspectRatio) || ASPECT_RATIO_OPTIONS[1];
                        const paddingBottom = `${(arConfig.height / arConfig.width) * 100}%`;

                        return (
                          <div
                            key={job.id}
                            className="relative rounded-lg overflow-hidden ring-2 ring-purple-500/50 break-inside-avoid mb-3"
                            style={{ paddingBottom }}
                          >
                            {/* Animated rainbow radial gradient background */}
                            <div className="absolute inset-0 rainbow-radial-animation" />
                            {/* Dark overlay for readability */}
                            <div className="absolute inset-0 bg-black/30" />
                            {/* Content */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                              {/* Icon with pulsing ring */}
                              <div className="relative">
                                <Wand2 className="w-6 h-6 text-white/80" />
                                <div className="absolute inset-0 -m-1.5 rounded-full border-2 border-white/30 animate-ping" />
                              </div>
                              {/* Status message */}
                              <span className="text-xs font-medium text-white">
                                {job.status === 'running' ? 'Génération...' : 'En attente...'}
                              </span>
                              {/* Look name if available */}
                              {typeof job.input_data?.lookName === 'string' && (
                                <span className="text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded truncate max-w-[90%]">
                                  {job.input_data.lookName}
                                </span>
                              )}
                              {/* Progress if available */}
                              {job.progress > 0 && (
                                <span className="text-sm font-bold text-white/90">
                                  {Math.round(job.progress)}%
                                </span>
                              )}
                            </div>
                            {/* Progress bar at bottom */}
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                              <div
                                className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 transition-all duration-300 ease-out"
                                style={{ width: `${job.progress || 5}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {/* Existing looks */}
                      {looks.map((look) => (
                        <div
                          key={look.id}
                          className="relative rounded-lg overflow-hidden group border border-white/10 break-inside-avoid mb-3"
                        >
                          <StorageImg
                            src={look.imageUrl}
                            alt={look.name}
                            className="w-full h-auto"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
                            <div className="absolute bottom-0 left-0 right-0 p-2">
                              <p className="text-xs font-medium text-white truncate">{look.name}</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const charRef = generateReferenceName(name, '@');
                                  const lookRef = generateLookReferenceName(look.name);
                                  navigator.clipboard.writeText(`${charRef} ${lookRef}`);
                                }}
                                className="text-[9px] font-mono mt-0.5 flex items-center gap-0.5"
                                title="Copier la référence"
                              >
                                <span className="text-blue-400">{generateReferenceName(name, '@')}</span>
                                <span className="text-purple-400">{generateLookReferenceName(look.name)}</span>
                              </button>
                            </div>
                          </div>
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Add/Remove from project button */}
                            {projectId && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={cn(
                                  "h-6 w-6",
                                  selectedLookIds.has(look.id)
                                    ? "bg-green-500/80 text-white hover:bg-red-500/80"
                                    : "bg-black/50 text-white hover:bg-green-500/80"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleLook(look.id);
                                }}
                                disabled={loadingLookId === look.id}
                                title={selectedLookIds.has(look.id) ? "Retirer du projet" : "Ajouter au projet"}
                              >
                                {loadingLookId === look.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : selectedLookIds.has(look.id) ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Plus className="w-3 h-3" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 bg-black/50 text-white hover:bg-white/20"
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
                              <Download className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 bg-black/50 text-white hover:bg-red-500/80"
                              onClick={() => removeLook(look.id)}
                              title="Supprimer"
                            >
                              <Trash2 className="w-3 h-3" />
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

                  {/* Selected voice - compact single block */}
                  {voiceId && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                      {/* Voice icon */}
                      <div className="p-2 rounded-lg bg-green-500/20 flex-shrink-0">
                        <Volume2 className="w-4 h-4 text-green-400" />
                      </div>

                      {/* Voice info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{voiceName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-green-400">ElevenLabs</span>
                          <span className="text-slate-600">•</span>
                          {creatingFalVoice ? (
                            <span className="flex items-center gap-1 text-xs text-amber-400">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Création Kling...
                            </span>
                          ) : falVoiceId ? (
                            <span className="flex items-center gap-1 text-xs text-purple-400">
                              <Check className="w-3 h-3" />
                              Kling
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-400">
                              <AlertCircle className="w-3 h-3" />
                              Kling manquant
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Play sample */}
                        {falVoiceSampleUrl && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={playVoiceSample}
                            className="h-8 w-8 text-slate-400 hover:text-white"
                            title="Écouter l'échantillon"
                          >
                            {playingSample ? (
                              <Square className="w-4 h-4 fill-current" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                        )}

                        {/* Create Kling voice */}
                        {!falVoiceId && !creatingFalVoice && (character?.id || savedCharacterId) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => createFalVoice((character?.id || savedCharacterId)!)}
                            className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                            title="Créer voix Kling"
                          >
                            <Wand2 className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Remove voice */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setVoiceId('');
                            setVoiceName('');
                            setFalVoiceId('');
                            setFalVoiceSampleUrl('');
                            if (sampleAudioRef.current) {
                              sampleAudioRef.current.pause();
                              setPlayingSample(false);
                            }
                          }}
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          title="Retirer la voix"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
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
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-white truncate">
                                  {voice.name}
                                </p>
                                {voice.isLibrary && (
                                  <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded font-medium">
                                    Library
                                  </span>
                                )}
                              </div>
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
            filter: blur(30px);
            opacity: 0.6;
            transform: scale(1.3);
          }

          @keyframes rainbow-spin {
            from {
              transform: scale(1.3) rotate(0deg);
            }
            to {
              transform: scale(1.3) rotate(360deg);
            }
          }
        `}</style>
      </DialogContent>

      {/* Gallery Picker for looks - two-step flow: select image, then enter name/description */}
      <GalleryPicker
        isOpen={showGalleryPicker}
        onClose={() => setShowGalleryPicker(false)}
        onSelect={handleGallerySelect}
        title="Choisir une image pour le look"
        requireLookInfo
      />

      {/* Rushes Dialog - show previous generations for a type */}
      <Dialog open={!!showRushesFor} onOpenChange={(open) => !open && setShowRushesFor(null)}>
        <DialogContent className="sm:max-w-[600px] bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Rushes - {IMAGE_TYPES.find((t) => t.value === showRushesFor)?.label}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Générations précédentes. Cliquez sur une image pour la remettre en avant.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {showRushesFor && getRushesForType(showRushesFor).length > 0 ? (
              <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto scrollbar-none">
                {getRushesForType(showRushesFor).map((rush, index) => (
                  <div
                    key={`${rush.url}-${index}`}
                    className="relative group rounded-lg overflow-hidden cursor-pointer ring-1 ring-white/10 hover:ring-amber-500/50 transition-all"
                    onClick={() => {
                      promoteRush(rush);
                      setShowRushesFor(null);
                    }}
                  >
                    <StorageImg
                      src={rush.url}
                      alt={`Rush ${index + 1}`}
                      className="w-full aspect-[3/4] object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:bg-white/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          promoteRush(rush);
                          setShowRushesFor(null);
                        }}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Utiliser
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-400 hover:bg-red-500/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRush(rush.url);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Supprimer
                      </Button>
                    </div>
                    <div className="absolute bottom-1 left-1 right-1">
                      <span className="text-[10px] text-white/70 bg-black/60 px-1.5 py-0.5 rounded">
                        {new Date(rush.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Aucun rush pour cette vue</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
