'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Users,
  Package,
  MapPin,
  Library as LibraryIcon,
  Sparkles,
  Wand2,
  RefreshCw,
  Trash2,
  Edit2,
  Check,
  X,
  Loader2,
  ImageIcon,
  AlertCircle,
  Palette,
} from 'lucide-react';

interface GenerationProgress {
  current: number;
  total: number;
}

interface Character {
  id: string;
  name: string;
  description: string;
  visual_description: string;
  age?: string;
  gender?: string;
  reference_images?: string[];
  generation_status?: string;
  generation_error?: string;
  generation_progress?: GenerationProgress | string;
}

interface Prop {
  id: string;
  name: string;
  type: string;
  visual_description: string;
  reference_images?: string[];
  generation_status?: string;
  generation_error?: string;
  generation_progress?: GenerationProgress | string;
}

interface Location {
  id: string;
  name: string;
  type: string;
  visual_description: string;
  lighting?: string;
  mood?: string;
  reference_images?: string[];
  generation_status?: string;
  generation_error?: string;
  generation_progress?: GenerationProgress | string;
}

interface ExtractionResult {
  characters: Character[];
  props: Prop[];
  locations: Location[];
}

const VISUAL_STYLES = [
  { value: 'photorealistic', label: 'Photoréaliste', description: 'Images réalistes, cinématographiques' },
  { value: 'cartoon', label: 'Cartoon', description: 'Style Pixar/Disney, animation 3D' },
  { value: 'anime', label: 'Anime', description: 'Style japonais, Studio Ghibli' },
  { value: 'cyberpunk', label: 'Cyberpunk', description: 'Futuriste, néons, Blade Runner' },
  { value: 'noir', label: 'Film Noir', description: 'Noir et blanc, années 40' },
  { value: 'watercolor', label: 'Aquarelle', description: 'Peinture artistique, doux' },
];

const PROP_TYPES = [
  { value: 'object', label: 'Objet' },
  { value: 'vehicle', label: 'Véhicule' },
  { value: 'furniture', label: 'Mobilier' },
  { value: 'weapon', label: 'Arme' },
  { value: 'food', label: 'Nourriture' },
  { value: 'other', label: 'Autre' },
];

const LOCATION_TYPES = [
  { value: 'interior', label: 'Intérieur' },
  { value: 'exterior', label: 'Extérieur' },
];

type DialogType = 'character' | 'prop' | 'location' | 'extraction' | 'style' | null;

export default function LibraryPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // Data state
  const [characters, setCharacters] = useState<Character[]>([]);
  const [props, setProps] = useState<Prop[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [visualStyle, setVisualStyle] = useState('photorealistic');
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogType, setDialogType] = useState<DialogType>(null);
  const [editingItem, setEditingItem] = useState<Character | Prop | Location | null>(null);

  // Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [savingExtraction, setSavingExtraction] = useState(false);

  // Generation state
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  // Forms
  const [characterForm, setCharacterForm] = useState({
    name: '',
    description: '',
    visual_description: '',
    age: '',
    gender: '',
  });

  const [propForm, setPropForm] = useState({
    name: '',
    type: 'object',
    visual_description: '',
  });

  const [locationForm, setLocationForm] = useState({
    name: '',
    type: 'interior',
    visual_description: '',
    lighting: '',
    mood: '',
  });

  const [saving, setSaving] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);

  // Fetch inventory
  const fetchInventory = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/inventory`);
      const data = await res.json();
      if (data.characters) setCharacters(data.characters);
      if (data.props) setProps(data.props);
      if (data.locations) setLocations(data.locations);
      if (data.project?.visual_style) setVisualStyle(data.project.visual_style);
    } catch (error) {
      console.error('Error fetching inventory:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Poll for progress when generating
  useEffect(() => {
    const hasGenerating = [
      ...characters,
      ...props,
      ...locations,
    ].some(e => e.generation_status === 'generating');

    if (!hasGenerating) return;

    const interval = setInterval(() => {
      fetchInventory();
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [characters, props, locations, fetchInventory]);

  // Extract from script
  const handleExtractFromScript = async () => {
    setExtracting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/extract-inventory`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.extraction) {
        setExtractionResult(data.extraction);
        setDialogType('extraction');
      } else if (data.error) {
        alert(data.error);
      }
    } catch (error) {
      console.error('Error extracting:', error);
      alert('Erreur lors de l\'extraction');
    } finally {
      setExtracting(false);
    }
  };

  // Save extraction
  const handleSaveExtraction = async () => {
    if (!extractionResult) return;
    setSavingExtraction(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characters: extractionResult.characters,
          props: extractionResult.props,
          locations: extractionResult.locations,
          clearExisting: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setDialogType(null);
        setExtractionResult(null);
        fetchInventory();
      }
    } catch (error) {
      console.error('Error saving extraction:', error);
    } finally {
      setSavingExtraction(false);
    }
  };

  // Update visual style
  const handleUpdateStyle = async (newStyle: string) => {
    setVisualStyle(newStyle);
    try {
      await fetch(`/api/projects/${projectId}/inventory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visual_style: newStyle }),
      });
    } catch (error) {
      console.error('Error updating style:', error);
    }
  };

  // Generate reference image (with optional multi-view for characters)
  const handleGenerateImage = async (
    entityType: 'character' | 'prop' | 'location',
    entityId: string,
    multiView = false
  ) => {
    setGeneratingIds((prev) => new Set(prev).add(entityId));
    try {
      // Start generation (non-blocking for multi-view to allow progress updates)
      const fetchPromise = fetch(`/api/projects/${projectId}/generate-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, multiView }),
      });

      // Wait a bit then refresh to get generation_status and start polling
      await new Promise(r => setTimeout(r, 500));
      fetchInventory();

      // Now wait for completion
      const res = await fetchPromise;
      const data = await res.json();
      if (data.success) {
        fetchInventory();
      } else if (data.error) {
        console.error('Generation error:', data.error);
        alert(`Erreur: ${data.error}`);
        fetchInventory();
      }
    } catch (error) {
      console.error('Error generating image:', error);
      alert(`Erreur réseau: ${String(error)}`);
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(entityId);
        return next;
      });
    }
  };

  // Generate all images for a category
  const handleGenerateAll = async (entityType: 'character' | 'prop' | 'location') => {
    const items = entityType === 'character' ? characters : entityType === 'prop' ? props : locations;
    const itemsToGenerate = items.filter((item) => !item.reference_images?.length);

    for (const item of itemsToGenerate) {
      await handleGenerateImage(entityType, item.id);
    }
  };

  // Open dialogs
  const openCharacterDialog = (character?: Character) => {
    if (character) {
      setEditingItem(character);
      setCharacterForm({
        name: character.name,
        description: character.description || '',
        visual_description: character.visual_description || '',
        age: character.age || '',
        gender: character.gender || '',
      });
    } else {
      setEditingItem(null);
      setCharacterForm({
        name: '',
        description: '',
        visual_description: '',
        age: '',
        gender: '',
      });
    }
    setDialogType('character');
  };

  const openPropDialog = (prop?: Prop) => {
    if (prop) {
      setEditingItem(prop);
      setPropForm({
        name: prop.name,
        type: prop.type,
        visual_description: prop.visual_description || '',
      });
    } else {
      setEditingItem(null);
      setPropForm({
        name: '',
        type: 'object',
        visual_description: '',
      });
    }
    setDialogType('prop');
  };

  const openLocationDialog = (location?: Location) => {
    if (location) {
      setEditingItem(location);
      setLocationForm({
        name: location.name,
        type: location.type,
        visual_description: location.visual_description || '',
        lighting: location.lighting || '',
        mood: location.mood || '',
      });
    } else {
      setEditingItem(null);
      setLocationForm({
        name: '',
        type: 'interior',
        visual_description: '',
        lighting: '',
        mood: '',
      });
    }
    setDialogType('location');
  };

  // Save handlers
  const handleSaveCharacter = async () => {
    setSaving(true);
    try {
      if (editingItem) {
        await fetch(`/api/projects/${projectId}/characters/${editingItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(characterForm),
        });
      } else {
        await fetch(`/api/projects/${projectId}/characters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(characterForm),
        });
      }
      setDialogType(null);
      fetchInventory();
    } catch (error) {
      console.error('Error saving character:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProp = async () => {
    setSaving(true);
    try {
      if (editingItem) {
        await fetch(`/api/projects/${projectId}/props/${editingItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(propForm),
        });
      } else {
        await fetch(`/api/projects/${projectId}/props`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(propForm),
        });
      }
      setDialogType(null);
      fetchInventory();
    } catch (error) {
      console.error('Error saving prop:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLocation = async () => {
    setSaving(true);
    try {
      if (editingItem) {
        await fetch(`/api/projects/${projectId}/locations/${editingItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(locationForm),
        });
      } else {
        await fetch(`/api/projects/${projectId}/locations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(locationForm),
        });
      }
      setDialogType(null);
      fetchInventory();
    } catch (error) {
      console.error('Error saving location:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntity = async (entityType: 'character' | 'prop' | 'location', entityId: string) => {
    if (!confirm('Supprimer cet élément ?')) return;
    try {
      const endpoints = {
        character: 'characters',
        prop: 'props',
        location: 'locations',
      };
      await fetch(`/api/projects/${projectId}/${endpoints[entityType]}/${entityId}`, {
        method: 'DELETE',
      });
      fetchInventory();
    } catch (error) {
      console.error('Error deleting entity:', error);
    }
  };

  // Render entity card
  const renderEntityCard = (
    entity: Character | Prop | Location,
    entityType: 'character' | 'prop' | 'location',
    onEdit: () => void
  ) => {
    const isGenerating = generatingIds.has(entity.id);
    const images = entity.reference_images || [];
    const hasImage = images.length > 0;
    const hasMultiView = images.length === 3 && entityType === 'character';
    const isCharacter = entityType === 'character';
    const viewLabels = ['Face', 'Profil', 'Dos'];

    return (
      <Card key={entity.id} className="bg-slate-800/50 border-white/10 overflow-hidden relative flex flex-col">
        {/* Image container - fixed height for characters (same as 3-view layout) */}
        {isCharacter ? (
          // Character: always use multi-view container height
          <div className="grid grid-cols-3 gap-0.5 bg-slate-900">
            {hasMultiView ? (
              // 3 images
              images.map((img, idx) => (
                <button
                  key={idx}
                  className="aspect-[9/16] relative bg-slate-900/50 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPreviewImage({ url: img, label: `${entity.name} - ${viewLabels[idx]}` })}
                >
                  <Image
                    src={img}
                    alt={`${entity.name} - ${viewLabels[idx]}`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                    {viewLabels[idx]}
                  </div>
                </button>
              ))
            ) : hasImage ? (
              // 1 image centered in middle slot
              <>
                <div className="aspect-[9/16] bg-slate-900/80" />
                <button
                  className="aspect-[9/16] relative bg-slate-900/50 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPreviewImage({ url: images[0], label: entity.name })}
                >
                  <Image
                    src={images[0]}
                    alt={entity.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </button>
                <div className="aspect-[9/16] bg-slate-900/80" />
              </>
            ) : (
              // No image - placeholder
              <>
                <div className="aspect-[9/16] bg-slate-900/80" />
                <div className="aspect-[9/16] relative bg-slate-900/50 flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-slate-700" />
                </div>
                <div className="aspect-[9/16] bg-slate-900/80" />
              </>
            )}
          </div>
        ) : (
          // Props/Locations: landscape aspect ratio
          <div className="aspect-video relative bg-slate-900/50">
            {hasImage ? (
              <button
                className="w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setPreviewImage({ url: images[0], label: entity.name })}
              >
                <Image
                  src={images[0]}
                  alt={entity.name}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </button>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon className="w-16 h-16 text-slate-600" />
              </div>
            )}
          </div>
        )}

        {/* Generating overlay with progress */}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
            <div className="text-center w-full px-4">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400 mx-auto mb-2" />
              {(() => {
                const progress = entity.generation_progress;
                const parsed = typeof progress === 'string' ? JSON.parse(progress || '{}') : progress;
                if (parsed?.total > 1) {
                  const pct = (parsed.current / parsed.total) * 100;
                  return (
                    <>
                      <span className="text-sm text-slate-300">
                        Image {parsed.current}/{parsed.total}
                      </span>
                      <div className="mt-2 w-full max-w-[120px] mx-auto h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  );
                }
                return <span className="text-sm text-slate-300">Génération...</span>;
              })()}
            </div>
          </div>
        )}

        {/* Failed status */}
        {entity.generation_status === 'failed' && !isGenerating && (
          <div className="px-2 py-1 bg-red-500/20 border-t border-red-500/30">
            <span className="text-xs text-red-400">
              <AlertCircle className="w-3 h-3 inline mr-1" />
              {entity.generation_error?.substring(0, 40) || 'Erreur'}
            </span>
          </div>
        )}

        {/* Card content with flex-grow to push buttons down */}
        <CardContent className="p-4 flex flex-col flex-grow">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-medium text-white truncate">{entity.name}</h3>
            <div className="flex gap-1 flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-white"
                onClick={onEdit}
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-red-400"
                onClick={() => handleDeleteEntity(entityType, entity.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-400 line-clamp-2 flex-grow">
            {entity.visual_description || 'Aucune description visuelle'}
          </p>

          {/* Generation buttons - always at bottom */}
          <div className="mt-3">
            {isCharacter ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-white/10 hover:bg-white/5"
                  onClick={() => handleGenerateImage(entityType, entity.id, false)}
                  disabled={isGenerating || !entity.visual_description}
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-1" />
                      1x
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-white/10 hover:bg-white/5"
                  onClick={() => handleGenerateImage(entityType, entity.id, true)}
                  disabled={isGenerating || !entity.visual_description}
                  title="Générer 3 vues: face, profil, dos"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-1" />
                      3x
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full border-white/10 hover:bg-white/5"
                onClick={() => handleGenerateImage(entityType, entity.id)}
                disabled={isGenerating || !entity.visual_description}
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : hasImage ? (
                  <RefreshCw className="w-4 h-4 mr-2" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                {hasImage ? 'Régénérer' : 'Générer'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LibraryIcon className="w-5 h-5 text-slate-400" />
          <h2 className="text-xl font-semibold text-white">Bibliothèque</h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Visual style selector */}
          <Select value={visualStyle} onValueChange={handleUpdateStyle}>
            <SelectTrigger className="w-48 bg-slate-800/50 border-white/10">
              <Palette className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-white/10">
              {VISUAL_STYLES.map((style) => (
                <SelectItem key={style.value} value={style.value}>
                  <div>
                    <div className="font-medium">{style.label}</div>
                    <div className="text-xs text-slate-400">{style.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Extract from script */}
          <Button
            variant="outline"
            className="border-white/10 hover:bg-white/5"
            onClick={handleExtractFromScript}
            disabled={extracting}
          >
            {extracting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Extraire du script
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="characters" className="w-full">
        <TabsList className="bg-slate-800/50 border border-white/10">
          <TabsTrigger
            value="characters"
            className="data-[state=active]:bg-white/10"
          >
            <Users className="w-4 h-4 mr-2" />
            Personnages ({characters.length})
          </TabsTrigger>
          <TabsTrigger
            value="props"
            className="data-[state=active]:bg-white/10"
          >
            <Package className="w-4 h-4 mr-2" />
            Accessoires ({props.length})
          </TabsTrigger>
          <TabsTrigger
            value="locations"
            className="data-[state=active]:bg-white/10"
          >
            <MapPin className="w-4 h-4 mr-2" />
            Lieux ({locations.length})
          </TabsTrigger>
        </TabsList>

        {/* Characters */}
        <TabsContent value="characters" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-slate-400">
              {characters.filter((c) => c.reference_images?.length).length} / {characters.length} avec image
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 hover:bg-white/5"
                onClick={() => handleGenerateAll('character')}
                disabled={characters.every((c) => c.reference_images?.length) || generatingIds.size > 0}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Tout générer
              </Button>
              <Button
                size="sm"
                onClick={() => openCharacterDialog()}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>
          </div>
          {characters.length === 0 ? (
            <Card className="bg-slate-800/30 border-white/5">
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Aucun personnage défini.</p>
                <p className="text-sm text-slate-500 mt-1">
                  Extrayez-les du script ou ajoutez-les manuellement.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {characters.map((character) =>
                renderEntityCard(character, 'character', () => openCharacterDialog(character))
              )}
            </div>
          )}
        </TabsContent>

        {/* Props */}
        <TabsContent value="props" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-slate-400">
              {props.filter((p) => p.reference_images?.length).length} / {props.length} avec image
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 hover:bg-white/5"
                onClick={() => handleGenerateAll('prop')}
                disabled={props.every((p) => p.reference_images?.length) || generatingIds.size > 0}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Tout générer
              </Button>
              <Button
                size="sm"
                onClick={() => openPropDialog()}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>
          </div>
          {props.length === 0 ? (
            <Card className="bg-slate-800/30 border-white/5">
              <CardContent className="py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Aucun accessoire défini.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {props.map((prop) =>
                renderEntityCard(prop, 'prop', () => openPropDialog(prop))
              )}
            </div>
          )}
        </TabsContent>

        {/* Locations */}
        <TabsContent value="locations" className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-slate-400">
              {locations.filter((l) => l.reference_images?.length).length} / {locations.length} avec image
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 hover:bg-white/5"
                onClick={() => handleGenerateAll('location')}
                disabled={locations.every((l) => l.reference_images?.length) || generatingIds.size > 0}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Tout générer
              </Button>
              <Button
                size="sm"
                onClick={() => openLocationDialog()}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter
              </Button>
            </div>
          </div>
          {locations.length === 0 ? (
            <Card className="bg-slate-800/30 border-white/5">
              <CardContent className="py-12 text-center">
                <MapPin className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">Aucun lieu défini.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {locations.map((location) =>
                renderEntityCard(location, 'location', () => openLocationDialog(location))
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Extraction validation dialog */}
      <Dialog open={dialogType === 'extraction'} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">Validation de l'extraction</DialogTitle>
            <DialogDescription>
              Vérifiez et modifiez les éléments extraits avant de les sauvegarder.
              Cela remplacera l'inventaire existant.
            </DialogDescription>
          </DialogHeader>

          {extractionResult && (
            <div className="space-y-6 mt-4">
              {/* Characters */}
              <div>
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Personnages ({extractionResult.characters.length})
                </h3>
                <div className="space-y-2">
                  {extractionResult.characters.map((char, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{char.name}</span>
                        {char.age && <span className="text-xs text-slate-400">({char.age})</span>}
                        {char.gender && <span className="text-xs text-slate-400">• {char.gender}</span>}
                      </div>
                      <p className="text-sm text-slate-400">{char.visual_description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Props */}
              <div>
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Accessoires ({extractionResult.props.length})
                </h3>
                <div className="space-y-2">
                  {extractionResult.props.map((prop, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{prop.name}</span>
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">{prop.type}</span>
                      </div>
                      <p className="text-sm text-slate-400">{prop.visual_description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Locations */}
              <div>
                <h3 className="font-medium text-white mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Lieux ({extractionResult.locations.length})
                </h3>
                <div className="space-y-2">
                  {extractionResult.locations.map((loc, idx) => (
                    <div key={idx} className="p-3 bg-slate-800/50 rounded-lg border border-white/5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white">{loc.name}</span>
                        <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">{loc.type}</span>
                        {loc.lighting && <span className="text-xs text-slate-400">• {loc.lighting}</span>}
                      </div>
                      <p className="text-sm text-slate-400">{loc.visual_description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setDialogType(null)}
              className="border-white/10"
            >
              <X className="w-4 h-4 mr-2" />
              Annuler
            </Button>
            <Button onClick={handleSaveExtraction} disabled={savingExtraction}>
              {savingExtraction ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Valider et sauvegarder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Character Dialog */}
      <Dialog open={dialogType === 'character'} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingItem ? 'Modifier le personnage' : 'Nouveau personnage'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Nom</Label>
              <Input
                value={characterForm.name}
                onChange={(e) => setCharacterForm({ ...characterForm, name: e.target.value })}
                placeholder="Nom du personnage"
                className="bg-slate-800/50 border-white/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Âge</Label>
                <Input
                  value={characterForm.age}
                  onChange={(e) => setCharacterForm({ ...characterForm, age: e.target.value })}
                  placeholder="35 ans"
                  className="bg-slate-800/50 border-white/10"
                />
              </div>
              <div>
                <Label className="text-slate-300">Genre</Label>
                <Select
                  value={characterForm.gender}
                  onValueChange={(v) => setCharacterForm({ ...characterForm, gender: v })}
                >
                  <SelectTrigger className="bg-slate-800/50 border-white/10">
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-white/10">
                    <SelectItem value="homme">Homme</SelectItem>
                    <SelectItem value="femme">Femme</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-slate-300">Description</Label>
              <Textarea
                value={characterForm.description}
                onChange={(e) => setCharacterForm({ ...characterForm, description: e.target.value })}
                placeholder="Personnalité, background..."
                rows={2}
                className="bg-slate-800/50 border-white/10"
              />
            </div>
            <div>
              <Label className="text-slate-300">Description visuelle</Label>
              <Textarea
                value={characterForm.visual_description}
                onChange={(e) => setCharacterForm({ ...characterForm, visual_description: e.target.value })}
                placeholder="Apparence physique, vêtements, traits distinctifs..."
                rows={3}
                className="bg-slate-800/50 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)} className="border-white/10">
              Annuler
            </Button>
            <Button onClick={handleSaveCharacter} disabled={!characterForm.name.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prop Dialog */}
      <Dialog open={dialogType === 'prop'} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingItem ? "Modifier l'accessoire" : 'Nouvel accessoire'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Nom</Label>
              <Input
                value={propForm.name}
                onChange={(e) => setPropForm({ ...propForm, name: e.target.value })}
                placeholder="Nom de l'accessoire"
                className="bg-slate-800/50 border-white/10"
              />
            </div>
            <div>
              <Label className="text-slate-300">Type</Label>
              <Select
                value={propForm.type}
                onValueChange={(v) => setPropForm({ ...propForm, type: v })}
              >
                <SelectTrigger className="bg-slate-800/50 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/10">
                  {PROP_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Description visuelle</Label>
              <Textarea
                value={propForm.visual_description}
                onChange={(e) => setPropForm({ ...propForm, visual_description: e.target.value })}
                placeholder="Apparence, matériaux, couleurs..."
                rows={3}
                className="bg-slate-800/50 border-white/10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)} className="border-white/10">
              Annuler
            </Button>
            <Button onClick={handleSaveProp} disabled={!propForm.name.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={dialogType === 'location'} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="bg-slate-900 border-white/10">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingItem ? 'Modifier le lieu' : 'Nouveau lieu'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-slate-300">Nom</Label>
              <Input
                value={locationForm.name}
                onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                placeholder="Nom du lieu"
                className="bg-slate-800/50 border-white/10"
              />
            </div>
            <div>
              <Label className="text-slate-300">Type</Label>
              <Select
                value={locationForm.type}
                onValueChange={(v) => setLocationForm({ ...locationForm, type: v })}
              >
                <SelectTrigger className="bg-slate-800/50 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-white/10">
                  {LOCATION_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Description visuelle</Label>
              <Textarea
                value={locationForm.visual_description}
                onChange={(e) => setLocationForm({ ...locationForm, visual_description: e.target.value })}
                placeholder="Décor, ambiance, détails architecturaux..."
                rows={3}
                className="bg-slate-800/50 border-white/10"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Éclairage</Label>
                <Input
                  value={locationForm.lighting}
                  onChange={(e) => setLocationForm({ ...locationForm, lighting: e.target.value })}
                  placeholder="Lumière naturelle, néons..."
                  className="bg-slate-800/50 border-white/10"
                />
              </div>
              <div>
                <Label className="text-slate-300">Ambiance</Label>
                <Input
                  value={locationForm.mood}
                  onChange={(e) => setLocationForm({ ...locationForm, mood: e.target.value })}
                  placeholder="Mystérieux, chaleureux..."
                  className="bg-slate-800/50 border-white/10"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)} className="border-white/10">
              Annuler
            </Button>
            <Button onClick={handleSaveLocation} disabled={!locationForm.name.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editingItem ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-md p-0 bg-slate-900 border-white/10 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-white">{previewImage?.label}</DialogTitle>
          </DialogHeader>
          {previewImage && (
            <div className="relative aspect-[9/16] w-full">
              <Image
                src={previewImage.url}
                alt={previewImage.label}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          )}
          <div className="p-4 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-white/10"
              onClick={() => setPreviewImage(null)}
            >
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
