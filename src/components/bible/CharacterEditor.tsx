'use client';

import { useState, useEffect } from 'react';
import { User, Users, Image as ImageIcon, Mic, Save, Loader2, RefreshCw, Trash2, Baby, Radio, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StorageThumbnail } from '@/components/ui/storage-image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBibleStore, type GenericAssetLocalOverrides, type ImportedGenericCharacter } from '@/store/bible-store';
import { GENERIC_CHARACTERS } from '@/lib/generic-characters';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Icons for generic characters
const GENERIC_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crowd: Users,
  voice: Mic,
  person: User,
  child: Baby,
  announcer: Radio,
  narrator: BookOpen,
};

const IMAGE_TYPES = [
  { type: 'front', label: 'Face', description: 'Vue de face' },
  { type: 'profile', label: 'Profil', description: 'Vue de cote' },
  { type: 'three_quarter', label: '3/4', description: 'Vue trois-quarts' },
  { type: 'back', label: 'Dos', description: 'Vue arriere' },
] as const;

interface CharacterEditorProps {
  projectId: string;
  characterType: 'custom' | 'generic';
  characterId: string;
  projectAssetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CharacterEditor({
  projectId,
  characterType,
  characterId,
  projectAssetId,
  open,
  onOpenChange,
}: CharacterEditorProps) {
  const {
    projectGenericAssets,
    projectAssets,
    updateGenericAsset,
    generateGenericCharacterImages,
    fetchProjectGenericAssets,
  } = useBibleStore();

  const [activeTab, setActiveTab] = useState<'info' | 'images' | 'audio'>('info');
  const [isSaving, setIsSaving] = useState(false);
  const [generatingView, setGeneratingView] = useState<string | null>(null);

  // Form state for generic characters
  const [nameOverride, setNameOverride] = useState('');
  const [description, setDescription] = useState('');
  const [visualDescription, setVisualDescription] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');

  // Load character data
  useEffect(() => {
    if (!open) return;

    if (characterType === 'generic') {
      const genericAsset = projectGenericAssets.find(g => g.project_generic_asset_id === projectAssetId);
      if (genericAsset) {
        const overrides = genericAsset.local_overrides || {};
        // Get base generic character for fallback values
        const genericBase = GENERIC_CHARACTERS.find(g => g.id === genericAsset.id);

        setNameOverride(genericAsset.name_override || '');
        // Use local override, then base description from generic character
        setDescription(overrides.description || genericAsset.originalDescription || genericBase?.description || '');
        // Visual description: only load from local_overrides.visual_description (not the merged description)
        setVisualDescription(overrides.visual_description || '');
        setAge(overrides.age || '');
        setGender(overrides.gender || '');
      }
    }
  }, [open, characterType, projectAssetId, projectGenericAssets]);

  // Get current character data
  const genericAsset = characterType === 'generic'
    ? projectGenericAssets.find(g => g.project_generic_asset_id === projectAssetId)
    : null;

  const customAsset = characterType === 'custom'
    ? projectAssets.find(a => a.project_asset_id === projectAssetId)
    : null;

  const genericBase = genericAsset
    ? GENERIC_CHARACTERS.find(g => g.id === genericAsset.id)
    : null;

  const Icon = genericBase ? (GENERIC_ICONS[genericBase.icon] || User) : User;

  const handleSave = async () => {
    if (characterType !== 'generic') return;

    setIsSaving(true);
    try {
      const updates: { nameOverride?: string; localOverrides?: Partial<GenericAssetLocalOverrides> } = {};

      // Only include nameOverride if it changed
      if (nameOverride.trim() !== (genericAsset?.name_override || '')) {
        updates.nameOverride = nameOverride.trim() || undefined;
      }

      // Build local overrides
      const localOverrides: Partial<GenericAssetLocalOverrides> = {};
      if (description.trim()) localOverrides.description = description.trim();
      if (visualDescription.trim()) localOverrides.visual_description = visualDescription.trim();
      if (age.trim()) localOverrides.age = age.trim();
      if (gender) localOverrides.gender = gender;

      if (Object.keys(localOverrides).length > 0) {
        updates.localOverrides = localOverrides;
      }

      if (Object.keys(updates).length === 0) {
        toast.info('Aucune modification');
        return;
      }

      const result = await updateGenericAsset(projectId, projectAssetId, updates);
      if (result) {
        toast.success('Personnage mis a jour');
      } else {
        toast.error('Erreur lors de la mise a jour');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateImage = async (viewType: string) => {
    if (characterType !== 'generic') return;

    setGeneratingView(viewType);
    try {
      const jobId = await generateGenericCharacterImages(projectId, projectAssetId, {
        mode: 'generate_single',
        viewType: viewType as 'front' | 'profile' | 'back' | 'three_quarter',
        style: 'photorealistic',
        visualDescription: visualDescription || undefined,
      });

      if (jobId) {
        toast.success('Generation en cours...');
        // Refresh generic assets to get updated images when job completes
        setTimeout(() => fetchProjectGenericAssets(projectId), 5000);
      } else {
        toast.error('Erreur lors de la generation');
      }
    } finally {
      setGeneratingView(null);
    }
  };

  // Get reference images
  const referenceImages = genericAsset?.local_overrides?.reference_images_metadata || [];
  const getImageForType = (type: string) => referenceImages.find(img => img.type === type);

  if (!genericAsset && !customAsset) {
    return null;
  }

  const displayName = genericAsset
    ? (genericAsset.name_override || genericAsset.name)
    : (customAsset?.name || '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0 bg-[#0d1520] border-white/10 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              characterType === 'generic' ? 'bg-purple-500/20' : 'bg-blue-500/20'
            )}>
              <Icon className={cn(
                'w-5 h-5',
                characterType === 'generic' ? 'text-purple-400' : 'text-blue-400'
              )} />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-white">{displayName}</DialogTitle>
              {genericBase && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Base: {genericBase.name} - {genericBase.description}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'info' | 'images' | 'audio')} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-4 bg-white/5 border border-white/10">
            <TabsTrigger value="info" className="data-[state=active]:bg-white/10">
              <User className="w-4 h-4 mr-2" />
              Infos
            </TabsTrigger>
            <TabsTrigger value="images" className="data-[state=active]:bg-white/10">
              <ImageIcon className="w-4 h-4 mr-2" />
              References
            </TabsTrigger>
            <TabsTrigger value="audio" className="data-[state=active]:bg-white/10">
              <Mic className="w-4 h-4 mr-2" />
              Audio
            </TabsTrigger>
          </TabsList>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Info Tab */}
            <TabsContent value="info" className="m-0 space-y-4">
              {characterType === 'generic' ? (
                <>
                  {/* Name override */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Nom personnalise</Label>
                    <Input
                      value={nameOverride}
                      onChange={(e) => setNameOverride(e.target.value)}
                      placeholder={genericBase?.name || 'Ex: FEMME AGEE'}
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                    />
                    <p className="text-xs text-slate-500">
                      Laissez vide pour utiliser le nom original ({genericBase?.name})
                    </p>
                  </div>

                  {/* Age and Gender */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Age</Label>
                      <Input
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        placeholder="Ex: 60 ans, jeune, adolescent"
                        className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Genre</Label>
                      <Select value={gender} onValueChange={setGender}>
                        <SelectTrigger className="bg-white/5 border-white/10 text-white">
                          <SelectValue placeholder="Selectionner..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[#1a2433] border-white/10">
                          <SelectItem value="male">Masculin</SelectItem>
                          <SelectItem value="female">Feminin</SelectItem>
                          <SelectItem value="other">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Description</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Description du personnage pour le script..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 min-h-[80px]"
                    />
                  </div>

                  {/* Visual description */}
                  <div className="space-y-2">
                    <Label className="text-slate-300">Description visuelle</Label>
                    <Textarea
                      value={visualDescription}
                      onChange={(e) => setVisualDescription(e.target.value)}
                      placeholder="Apparence physique pour la generation d'images: traits du visage, coiffure, vetements..."
                      className="bg-white/5 border-white/10 text-white placeholder:text-slate-500 min-h-[100px]"
                    />
                    <p className="text-xs text-slate-500">
                      Cette description sera utilisee pour generer les portraits de reference
                    </p>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <p>L edition des personnages personnalises se fait dans la Bible generale</p>
                </div>
              )}
            </TabsContent>

            {/* Images Tab */}
            <TabsContent value="images" className="m-0">
              {characterType === 'generic' ? (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400">
                    Generez des images de reference pour avoir une consistance visuelle dans vos plans
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    {IMAGE_TYPES.map(({ type, label, description }) => {
                      const image = getImageForType(type);
                      const isGenerating = generatingView === type;

                      return (
                        <div
                          key={type}
                          className="p-4 rounded-lg bg-white/5 border border-white/10"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <p className="text-sm font-medium text-white">{label}</p>
                              <p className="text-xs text-slate-500">{description}</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateImage(type)}
                              disabled={isGenerating || !visualDescription}
                              className="border-white/10 text-slate-300 hover:bg-white/10"
                            >
                              {isGenerating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : image ? (
                                <RefreshCw className="w-4 h-4" />
                              ) : (
                                <ImageIcon className="w-4 h-4" />
                              )}
                            </Button>
                          </div>

                          {image ? (
                            <StorageThumbnail
                              src={image.url}
                              alt={`${displayName} - ${label}`}
                              size={200}
                              className="w-full aspect-square rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-full aspect-square rounded-lg bg-white/5 flex items-center justify-center">
                              <div className="text-center text-slate-500">
                                <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-xs">Pas d image</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!visualDescription && (
                    <p className="text-xs text-amber-400 text-center">
                      Ajoutez une description visuelle dans l onglet Infos pour pouvoir generer des images
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <p>Les images de reference des personnages personnalises sont gerees dans la Bible generale</p>
                </div>
              )}
            </TabsContent>

            {/* Audio Tab */}
            <TabsContent value="audio" className="m-0">
              <div className="text-center py-8 text-slate-400">
                <Mic className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>La selection de voix sera disponible prochainement</p>
              </div>
            </TabsContent>
          </div>

          {/* Footer */}
          {characterType === 'generic' && (
            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-white/10 text-slate-300 hover:bg-white/5"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Enregistrer
              </Button>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
